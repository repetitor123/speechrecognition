const { Readable } = require('stream');
const vosk = require("vosk");
vosk.setLogLevel(-1);
const model = new vosk.Model('vosk_models/ru');
const rec = new vosk.Recognizer({ model: model, sampleRate: 48000 });
const config = require("./config.json");
const youtubeAudio = require('youtube-audio-stream');
vosk._rec_ = rec;

const Discord = require('discord.js')

class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xF8, 0xFF, 0xFE]))
  }
}

function transcribe(buffer) {
  vosk._rec_.acceptWaveform(buffer);
  let ret = vosk._rec_.result().text;
  return ret;
}

async function convert_audio(input) {
  try {
    const data = new Int16Array(input)
    const ndata = new Int16Array(data.length / 2)
    for (let i = 0, j = 0; i < data.length; i += 4) {
      ndata[j++] = data[i]
      ndata[j++] = data[i + 1]
    }
    return Buffer.from(ndata);
  } catch (e) {
    console.log(e)
  }
}

async function recognitionCommands(data, member, connection) {
  let text = data.split(/ +/g).join("")
  console.log(text)
  const commands = Object.keys(config.recognitionCommands);
  const cmd = commands.find(c => text.includes(c));
  if (!cmd) return;

  const url = config.recognitionCommands[cmd];

  console.log('Обнаружена команда |', cmd);

  connection.play(url, { volume: 1 });
}

const client = new Discord.Client()

client.on('ready', () => {
  console.log(`Started.`)
})

client.on('message', async ctx => {
  if (!ctx.content.startsWith(config.prefix)) return

  const command = ctx.content.slice(config.prefix.length).split();
  if (ctx.member.id !== config.ownerId) return;

  switch (command[0]) {
    case 'join':
      if (ctx.member.voice.channel) {
        const connection = await ctx.member.voice.channel.join()

        connection.play(new Silence(), { type: 'opus' })

        connection.on('speaking', async (user, speaking) => {
          if (speaking.has('SPEAKING')) {
            if (user.id !== config.ownerId) return;
            if (speaking.bitfield === 0 || user.bot) return
            let audioStream = connection.receiver.createStream(user, { mode: 'pcm' });
            let buffer = [];
            audioStream.on('data', (data) => buffer.push(data))
            audioStream.on('end', async () => {
              buffer = Buffer.concat(buffer);

              try {
                let new_buffer = await convert_audio(buffer)
                let out = await transcribe(new_buffer)
                if (out != null && out !== "") await recognitionCommands(out.toLowerCase(), ctx.member, connection)
              } catch (e) {
                console.log(e)
              }
            })
          }
        })
      }
      break

    case 'leave':
      try { ctx.guild.voice.channel.leave() } catch {}
      break

    default:
      break
  }
})

client.login(config.token)
