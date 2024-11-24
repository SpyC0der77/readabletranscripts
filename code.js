import { marked } from "https://esm.run/marked";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";
const params = new URLSearchParams(window.location.search)
let API_KEY = params.get('key')
if (!API_KEY) {
  API_KEY = prompt('Gemini API_KEY')
}
let ytPlayer = null
async function initVideoPlayer(videoId) {
  function onPlayerReady(event) {
    ytPlayer = event.target;
  }
  function onPlayerStateChange(state) {
    try {
      // Disable captions completelly
      ytPlayer.unloadModule("captions");
      ytPlayer.unloadModule("cc");
    } catch (e) { console.log(e)}
    if (state.data === 1) {
      setPlaying(true)
    } else if (state.data === 2) {
      setPlaying(false)
    }
  }
  function onPlayerError(event) {
    console.log('player error', event.data);
  }

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  let firstScriptTag = document.getElementsByTagName("script")[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  window.onYouTubeIframeAPIReady = function() {
    const ytPlayer = new YT.Player("player", {
      height: "270",
      width: "480",
      host: 'https://www.youtube-nocookie.com',
      videoId: videoId,
      playerVars: {
        playsinline: 1,
        autoplay: 0,
        loop: 0,
        controls: 0,
        disablekb: 0,
        rel: 0,
      },
      events: {
      "onReady": onPlayerReady,
      "onStateChange": onPlayerStateChange,
      "onError": onPlayerError,
    }
    });
    let iframeWindow = ytPlayer.getIframe().contentWindow;
    window.addEventListener("message", function(event) {
      if (event.source === iframeWindow) {
        let data = JSON.parse(event.data);
        if (data.event === "infoDelivery" && data.info) {
          if (data.info.currentTime !== undefined) {
            let time = data.info.currentTime
            audioTimeUpdate(time)
          }
        }
      }
    });
  }
}

let current = null
const followingAudio = true
let chapters = []
let jumped = null
let currentCaption = ['Click to play']
let transcribing = false
let worker = new Worker('scribe-worker.js', { type: 'module'})
worker.addEventListener('message', workerEvent)

function workerEvent(event) {
const message = event.data;
const type = message.type;
const data = message.data;
console.log(message)
if (type === 'update') {
transcribing = false
updateTTS(message.fulltext, data.chunks)
} else if (type === 'result') {
if (!data)
  return;
updateTTS(data.text, data.chunks)
} else if (type === 'error') {
console.log('error TTS')
alert('Error' + data)
}
}

function updateTTS(text, chunks) {
console.log('updateTTS',text, chunks)
}

async function tts(videoId) {
try {
const sampling_rate = 16000;
const audioCTX = new AudioContext({ sampleRate: sampling_rate })
const response = await fetch('/audio?id=' + videoId);
const buffer = await response.arrayBuffer()
const audioData = await audioCTX.decodeAudioData(buffer)
let audio = null
if (audioData.numberOfChannels === 2) {
  const SCALING_FACTOR = Math.sqrt(2)
  let left = audioData.getChannelData(0)
  let right = audioData.getChannelData(1)
  audio = new Float32Array(left.length)
  for (let i = 0; i < audioData.length; ++i) {
    audio[i] = SCALING_FACTOR * (left[i] + right[i]) / 2
  }
} else {
    // If the audio is not stereo, we can just use the first channel:
    audio = audioData.getChannelData(0)
}
worker.postMessage({ audio, type: 'speech-to-text' })
} catch (e) {
console.error('error tts',e);
}
}

window.tts = tts
function endOfSentence2(text) {
return text.endsWith('. ') || text.endsWith('? ') || text.endsWith('! ')
}
function findSentence(span) {
let elem = span || punctuated.querySelector('.highlighted')
if (!elem)
return ''
let text = ''
let prev = elem
elem = elem.previousElementSibling
while (elem && elem.tagName === 'SPAN') {
if (endOfSentence2(elem.textContent))
  break
prev = elem
elem = elem.previousElementSibling
}
elem = prev
while (elem) {
text += elem.textContent
if (endOfSentence2(elem.textContent))
  break
elem = elem.nextElementSibling
}
return text
}

let resetCaptions = false
let userJumps = false

function updateTimeCaption(timeSeconds) {
currentTime.textContent = msToTime(parseInt(timeSeconds * 1000)) + '/' + msToTime(videoDuration * 1000)
}
function audioTimeUpdate(timeSeconds) {
updateTimeCaption(timeSeconds)
let time = timeSeconds * 1000
timeline.value = time
let ps = punctuated.querySelectorAll('.p')
let last = -1
let lastHighlightedWord = null
let lastHighlightedParagraph = null
for (let i = 0; i < ps.length; i++) {
let p = ps[i]
if (p.start !== -1 && p.start <= time)
  last = i
let words = p.querySelectorAll('span')
for (let w of words) {
  if (!w.start)
    continue
  //const delta = 400
  //const highlight = w.start >= (time - delta) && w.end <= time + delta * 3
  const delta = 1000
  const highlight = w.start >= (time - delta) && w.end <= time + delta
  //let c = []
  if (highlight && !w.classList.contains('highlighted')) {
    w.classList.add('highlighted')
    lastHighlightedWord = w
    lastHighlightedParagraph = p
    //console.log('highlight',w)
    //c.push(w.textContent)
  }
  if (!highlight && w.classList.contains('highlighted'))
    w.classList.remove('highlighted')
}
}
currentCaption = [...punctuated.querySelectorAll('.highlighted')].map(a => a.textContent)
if (currentCaption.length === 0 && !isPlaying())
currentCaption = ['Click to Play']
current = null
for (let i = 0; i < ps.length; i++) {
let p = ps[i]
if (i !== last) {
  if (p.classList.contains('livep')) {
    p.classList.remove('livep')
  }
} else {
  current = p
  if (!p.classList.contains('livep')) {
    p.classList.add('livep')
    if (followingAudio) {
      let y = p.getBoundingClientRect().top + window.pageYOffset - player.offsetHeight
      if (jumped) {
        y = jumped
        jumped = null
      }
      if (userJumps) {
        userJumps = false
        window.scrollTo({left: 0, top: y, behavior: 'smooth'})
      }
    }
  }
}
}

for (let c of chapters) {
c.currentChapter = false
}
for (let i = chapters.length - 1; i >= 0; --i) {
if (chapters[i].start <= time) {
  chapters[i].currentChapter = true
  break
}
}
}
function setPlaying(p) {
  //console.log('setPlaying',p)
}

function getGenerativeModel(API_KEY, params) {
  const genAI = new GoogleGenerativeAI(API_KEY);
  return genAI.getGenerativeModel(params);
}

function chunkText(text, maxWords = 4000) {
  const words = text.split(/\s+/); // Split the text into words
  const chunks = [];
  let currentChunk = [];
  for (let i = 0; i < words.length; i++) {
    currentChunk.push(words[i]);

    if (currentChunk.length >= maxWords || i === words.length - 1) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [];
    }
  }

  return chunks;
}
const modelName = 'gemini-1.5-flash-8b'
//const modelName = 'gemini-1.5-flash-8b-latest'
const generationConfig = {
  candidateCount: 1,
  //stopSequences: ['x'],
  //maxOutputTokens: 2000000,
  temperature: 1.0,
}
const model = await getGenerativeModel(API_KEY, { model: modelName });
window.model = model
async function search(q) {
  let json = await (await fetch('/yts?q=' + encodeURIComponent(q))).json()
  if (json.error)
    items.innerHTML = 'Error:' + json.error
  else if (json.items) {
    items.innerHTML = ''
    for (let item of json.items) {
      let d = document.createElement('div')
      d.className = 'r'
      d.innerHTML = `<a href="?id=${item.id}"><img src="${item.thumbnail}"></a><div><a href="?id=${item.id}">${item.name || item.title}</a><div>${item.duration} - ${item.published}</div></div><br>`
      items.appendChild(d)
    }
  }
}

const languages = {
ar: "Arabic",
bn: "Bengali",
bg: "Bulgarian",
zh: "Chinese",
hr: "Croatian",
cs: "Czech",
da: "Danish",
nl: "Dutch",
en: "English",
et: "Estonian",
fi: "Finnish",
fr: "French",
de: "German",
el: "Greek",
iw: "Hebrew",
hi: "Hindi",
hu: "Hungarian",
id: "Indonesian",
it: "Italian",
ja: "Japanese",
ko: "Korean",
lv: "Latvian",
lt: "Lithuanian",
no: "Norwegian",
pl: "Polish",
pt: "Portuguese",
ro: "Romanian",
ru: "Russian",
sr: "Serbian",
sk: "Slovak",
sl: "Slovenian",
es: "Spanish",
sw: "Swahili",
sv: "Swedish",
th: "Thai",
tr: "Turkish",
uk: "Ukrainian",
vi: "Vietnamese"
};

function timeout(ms) {
return new Promise(resolve => setTimeout(resolve, ms));
}

let outputTokens = 0
let inputTokens = 0
let totalTokens = 0
const inputPrice = 0.0375 // 1 million tokens
const outputPrice = 0.15 // 1 million tokens
const simulatedUsers = 1
function computePrice(token, pricePerMillion) {
return token * pricePerMillion / 1000000 * simulatedUsers
}

function formatPrice(price) {
return price.toLocaleString('en-US',{minimumFractionDigits: 2, maximumFractionDigits: 5, style: "currency", currency: "USD"})
}
async function getModelAnswer(prompt, maxretry = 4) {
for (let i=0; i < maxretry; i++) {
try {
let res = await model.generateContent([prompt])
inputTokens += res.response.usageMetadata.promptTokenCount
outputTokens += res.response.usageMetadata.candidatesTokenCount
totalTokens += res.response.usageMetadata.totalTokenCount
const priceInput = computePrice(inputTokens, inputPrice)
const priceOutput = computePrice(outputTokens, outputPrice)
const priceTotal = priceInput + priceOutput
usageDiv.textContent = `for ${simulatedUsers.toLocaleString()} users: ${inputTokens} ${formatPrice(priceInput)} ${outputTokens} ${formatPrice(priceOutput)} ${totalTokens} ${formatPrice(priceTotal)}`
return res
} catch (error) {
console.log('error getting model, waiting for 2 seconds',error)
await timeout(2000)
}
}
}

async function getBestPassages(text) {
let res = await getModelAnswer('Please list, one per line without extra characters, the best segments in this transcript: ' + text)
let passages = res.response.text().split('\n')
return passages
}
function languageName(lang) {
  let name = languages[lang]
  console.error('************** languageName',lang, name)
  return name ?? 'English'
}
const chunkSize = 512 // longer context makes the AI hallucinate more
async function punctuateText(c, vocab = '', lang = 'en', p = null) {
  const prompt = `
  - fix the grammar and typos of the given video text transcript
  - do not rephrase: keep the original wording but fix errors
  - write in the ${languageName(lang)} language
  - please add paragraphs where appropriate
  - do not add paragraphs numbers
  - use this list of words as context to help you fix typos: """${vocab}""""
  - answer with plain text only
  Here is the video text transcript to fix:
  """${c}"""`
  let finalPrompt = p ? p + c : prompt
  if (p)
    console.log('prompt=',p,c)
  let res = await getModelAnswer(finalPrompt)
  return new Promise((a,r) => {
    let text = res.response.text()
    if (text.indexOf(lang) === 0)
      text = text.substring(lang.length)
    a(text)
  })
}

async function mergeSentences(a, b, vocab, languageCode = 'en') {
  let res = await punctuateText(clean(a) + ' ' + clean(b), vocab, languageCode, `please fix this sentence, without paragraphrasing, write in ${languageName(languageCode)}: `)
  res = res.replace(/\s+/g,' ')
  console.log('merge=', res)
  return res
}

function findChunkEnd(a) {
  let sa = a.split(/\. /)
  let s1 = sa.pop()
  let start = a.substring(0, a.length - s1.length)
  return {paragraph: start, end: s1}
}

function findChunkStart(b) {
  let sb = b.split(/\. /)
  let s2 = sb.shift()
  let end = b.substring(s2.length)
  return {paragraph: end, start: s2}
}

function clean(a) {
  return a.toLowerCase().replace(/[^\w]/g, ' ')
}

function getWords(text) {
let paragraphs = text.split('\n')
let res = []
for (let p of paragraphs) {
// modern-day startups b1cicJ3OTvg
let words = p.split(/[\s-]+/).map(a => new Object({o: a, w: a.trim().toLowerCase().replace(/\W+/g,'')}))
//words = words.filter(w => w.o > '')
if (words.length > 0) {
  words[0].p = true
}
res = res.concat(words)
}
//console.log(res)
return res
}
function prepareWords(chunks) {
let res = []
for (let c of chunks) {
let len = c.text.length
let start = c.start
let end = c.start + c.dur
let words = getWords(c.original)
let dur = end - start
if (words.length > 0) {
  for (let w of words) {
    const durWord = w.w.length * dur / len
    let s = start
    let e = Math.min(end,start + durWord)
    start = Math.min(end,start+durWord)
    s = parseInt(s)
    e = parseInt(e)
    let obj = {w:w.w,o:w.o,s,e}
    res.push(obj)
  }
}
}
return res
}
function testDiff(wordTimes = [], punctuated = '') {
let onea = wordTimes.map(item => item.w)
let one = onea.join('\n')

let othera = getWords(punctuated)
let other = othera.map(w => w.w).join('\n') + '\n'

let map = []
let diff = Diff.diffLines(one, other);
let source = 0
let removed = 0
let added = 0
for (let part of diff) {
const n = part.count
for (let i = 0; i < n; i++) {
  if (part.removed) {
    removed++
    source++
  } else if (part.added) {
    added++
    map.push(-1)
  } else {
    map.push(source)
    source++
  }
}
}
let idx = 0
for (let i of map) {
if (i !== -1) {
  othera[idx].s = wordTimes[i].s
  othera[idx].e = wordTimes[i].e
}
idx++
}
let prevStart = 0
let i = 0
while (i < othera.length) {
let prevEnd = 0
while (i < othera.length && othera[i].e !== undefined) {
  prevEnd = othera[i].e
  i++
}
while (i < othera.length && othera[i].s === undefined) {
  //console.log('no start',othera[i].w)
  othera[i].s = prevEnd
  prevEnd += 200
  othera[i].e = prevEnd
  i++
}
}
othera.forEach(o => delete o.w)
return othera
}
let shownWords = {}
let startTime = 0

function absorb(evt) {
if (!evt)
return
evt.stopPropagation()
evt.preventDefault()
}
function insertPlaceholderChapter(p) {
let header = document.createElement('p')
header.start = p.start
header.className = 'header generating'
if (p.classList.contains('notpro'))
header.classList.add('notpro')
header.innerHTML = '<i class="spin spinsmall fa-solid fa-circle-notch"></i>'
p.chapter = 'generating'
p.parentElement.insertBefore(header,p)
}
function makeChapterContent(c) {
if (!c || !c.text)
return ''
let text = c.text.replace(/(\(?(?:https?|ftp):\/\/[\n\S]+\)?)/g, '').trim()
return `<div class="headername">${text}</div>`
}

function insertChapter(p,c) {
c.taken = true
let header = document.createElement('p')
header.className = 'header'
if (p.classList.contains('notpro'))
header.classList.add('notpro')
header.start = c.start
header.innerHTML = makeChapterContent(c)
p.chapter = c
p.header = header
//p.innerHTML = '<h4>' + c.text + '</h4>' + p.innerHTML
p.parentElement.insertBefore(header,p)
}
function endOfSentence(w) {
const ends = ['.','?','!']
if (!(w > ''))
return false
let lastChar = w[w.length-1]
return ends.indexOf(lastChar) !== -1
//return w > '' && w[w.length-1] === '.'
}
function msToTime(duration) {
if (!duration)
return '0:00'
let milliseconds = Math.floor((duration % 1000) / 100),
seconds = Math.floor((duration / 1000) % 60),
minutes = Math.floor((duration / (1000 * 60)) % 60),
hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

seconds = (seconds < 10) ? "0" + seconds : seconds;
if (hours > 0) {
minutes = (minutes < 10) ? "0" + minutes : minutes;
return hours + ":" + minutes + ":" + seconds
}
return minutes + ":" + seconds
}
function buildWords(words) {
let r = punctuated
let p = null
let end = false
for (let w of words) {
if (w.o === '.')
  continue
const key = w.o + '-' + w.s
if (end) {
  for (let c of chapters) {
    if (!c.taken && c.start <= w.s + 1000 && !c.taken) {
      w.p = true
    }
  }
}
end = endOfSentence(w.o)
if (shownWords[key]) {
  continue;
}
shownWords[key] = true

if (w.p && w.o > '') {
  p = document.createElement('p')
  p.className = 'p'
  p.start = w.s
  let ts = document.createElement('div')
  ts.className = 'ts'
  ts.start = w.s
  ts.textContent = msToTime(p.start)
  ts.addEventListener('click',() => {
    play(ts.start)
  })
  p.appendChild(ts)
  r.appendChild(p)
  for (let c of chapters) {
    if (c.start <= w.s + 1000 && !c.taken) {
      insertChapter(p,c)
    }
  }
}
if (w.o === '')
  continue
let span = document.createElement('span')
span.textContent = w.o + ' '
/*if (w.o.indexOf('`') !== -1) {
  span.innerHTML = '<code>' + w.o.replaceAll('`','') + '</code> '
}*/
if (w.s !== undefined) {
  span.start = w.s
  span.end = w.e
  span.addEventListener('click',(evt) => {
    absorb(evt)
    if (span.classList.contains('highlighted'))
      realplayer.pause()
    else
      play(span.start)
    //let res = findSentence(evt.target)
    //console.log(res)
  })
  /*span.addEventListener('mousemove',(evt) => {
    absorb(evt)
    if (evt.buttons && !span.classList.contains('yawas'))
      span.classList.add('yawas')
  })*/
}
if (p) {
  p.appendChild(span)
}
}

if (!chapters || chapters.length === 0) {
let paragraphs = r.querySelectorAll('.p')
let idx = 0
for (let p of paragraphs) {
  if (idx % 3 === 0 && !p.chapter) {
    insertPlaceholderChapter(p)
  }
  idx += 1
}
}
updateHighlights()
}

function isPlaying() {
return ytPlayer? ytPlayer.getPlayerState() === 1 : !realplayer.paused
}
let lastStart = null
function play(start) {
console.log('play',start)
const playing = isPlaying()
if (!playing || start !== lastStart) {
ytPlayer ? ytPlayer.seekTo(start / 1000, /* allowSeekAhead */ true) : realplayer.currentTime = start / 1000
ytPlayer ? ytPlayer.playVideo() : realplayer.play()
} else {
ytPlayer ? ytPlayer.pauseVideo() : realplayer.pause()
}
if (!ytPlayer && isPlaying())
realplayer.muted = false
lastStart = start
}
function keepCharacters(t) {
  return t.trim().toLowerCase().replace(/\W+/g,'')
}
function createChunks(chunks) {
  chunks.forEach((c,idx) => {
    let o = c.text
    c.original = o
    c.taken = false
    c.text = keepCharacters(o)
    c.end = c.start + c.dur
    if (idx > 0 && c.start < chunks[idx-1].end) {
      chunks[idx-1].end = c.start
      chunks[idx-1].dur = chunks[idx-1].end - chunks[idx-1].start
    }
  })
  return chunks.filter(c => c.text.length > 0)
}
function timeCodeToMs(time) {
  const items = time.split(":");
  return (
    items.reduceRight(
      (prev, curr, i, arr) =>
        prev + parseInt(curr) * 60 ** (arr.length - 1 - i),
      0
    ) * 1000
  );
}
function computeChapters(description) {
  if (!description)
    return []
  let res = []
  let lines = description.split('\n')
  const reg = new RegExp(/\(?((\d\d?:)?\d\d?:\d\d)\)? ?(-(\d\d?:)?\d\d?:\d\d)?/)
  let idx = 0
  for (let l of lines) {
    let m = l.match(reg)
    if (m) {
      const lineNumber = idx
      let ts = m[1].trim()
      let start = timeCodeToMs(ts)
      let text = l.replace(reg,'') // https://www.youtube.com/watch?v=SOxYgUIVq6g captions at the end
      if (text.indexOf('- ') === 0)
        text = text.substring(2)
      text = text.replace(/[_\-:–]+/g,'').trim()
      if (text.length === 0 && lineNumber < lines.length -1 && !lines[lineNumber+1].match(reg))
        text = lines[lineNumber+1].trim()
      res.push({text,start})
    }
    idx++
  }
  let uniques = []
  for (let r of res) {
    if (uniques.map(u => u.start).indexOf(r.start) === -1) {
      uniques.push(r)
    } else {
    }
  }
  if (uniques.length >= 2)
    return uniques
  else
    return []
}
function parseYTChapters(chapters) {
  if (!chapters)
    return []
  let res = []
  for (let c of chapters) {
    let start = c.start ?? c.start_time * 1000
    let text = c.title ?? c.text
    res.push({text,start})
  }
  return res
}
async function convertAudioFromUrlToBase64(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result
        const prefix = ';base64,'
        const idx = res.indexOf(prefix)
        resolve(res.substring(idx + prefix.length));
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);

    });
  } catch (error) {
    console.error('Error fetching audio or converting to base64:', error);
  }
}

async function transcribe() {
  console.log('transcribe')
  const prompt = "Generate audio diarization for this interview, and output a simple json format with keys: 'speaker', 'transcription', 'start', 'end'. If you can infer the speaker, please do. If not, use speaker A, speaker B, etc."
  const b64 = await convertAudioFromUrlToBase64('/static/cached/5.m4a')
  const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "audio/mp3",
          data: b64
        }
      },
      { text: prompt },
    ]);

  // Print the response.
  let res = result.response.text()
  console.log(res)
  let s = res.indexOf('[')
  let e = res.indexOf(']')
  //console.log(res)
  let payload = JSON.parse(res.substring(s,e+1))
  console.log(payload)
}
async function chapterize(transcript) {
  // examples from https://console.cloud.google.com/vertex-ai/publishers/google/model-garden/gemini-1.5-flash-001?hl=en
  const chapterPrompt = `Chapterize the video content by grouping the video content into chapters and providing a name for each chapter with its timecode. Please only capture key events and highlights. If you are not sure about any info, please do not make it up. Return the result in the JSON format with keys 'chapterName' and 'timecode'. Here is the video content: `
  //const result = await model.generateContent([`${chapterPrompt} ${transcript}`])
  const result = await getModelAnswer(`${chapterPrompt} ${transcript}`)
  let json = result.response.text()
  console.log(json)
}
async function createVocabulary(videoId, description = '', languageCode = 'en') {
  const key = languageCode + '-vocab-' + videoId
  const prevVocab = await localforage.getItem(key)
  if (prevVocab)
    return prevVocab
  if (!description || description.trim().length === 0)
    return ''
    //let res = await model.generateContent([`Return important words including names from this description and return as a simple list separated by commas: ${description}`])
    let res = await getModelAnswer(`Return important words including names from this description and return as a simple list separated by commas: ${description}`)
    let vocab = res.response.text().replace(/\s+/g,' ')
    localforage.setItem(key, vocab)
    return vocab
}

let ctx = canvas.getContext('2d')
let highlights = []
function addHighlight(evt) {
  absorb(evt)
  let s = window.getSelection().toString().trim()
  if (s.length === 0) {
    alert('Select the text you wish to highlight (expect paragraphs)')
    return
  }
  let selection = highlightSelection()
  if (selection) {
    window.getSelection().removeAllRanges()
    highlights.push(selection)
    updateHighlights()
  }
}
function updateHighlights() {
  let r = punctuated
  let paragraphs = r.querySelectorAll('p')
  for (let h of highlights) {
    if (h.start === null || h.end === null || h.start === undefined || h.end === undefined)
      continue
    let start = h.start
    let end = h.end
    start *= 100
    end *= 100
    for (let p of paragraphs) {
      let spans = p.querySelectorAll('span')
      let added = []
      for (let s of spans) {
        if (s.start >= start && s.end <= end) {
          s.classList.add('yawas')
          added.push(s)
        }
      }
    }
  }
}
canvas.onclick = () => {
  realplayer.paused ? realplayer.play() : realplayer.pause()
  if (isPlaying())
    realplayer.muted = false
}

function highlightSelection() {
  if (window.getSelection().rangeCount < 1)
    return null
  let range = window.getSelection().getRangeAt(0)
  if (range) {
    if (range.startContainer.parentNode.start === undefined)
      return null
    if (range.endContainer.parentNode.end === undefined)
      return null
    let start = Math.floor(range.startContainer.parentNode.start / 100)
    let end = Math.round(range.endContainer.parentNode.end / 100)
    if (end * 100 < range.endContainer.parentNode.end)
      end += 1
    return {start,end}
  }
  return null
}

// use font shadow like https://x.com/altryne/status/1848188194690408680?s=43&t=nMguAgZPu0YXUmgaqsct3w
function drawStrokedText(ctx, text, x, y, fill = 'yellow', baseline = 'bottom', blur = null)
{
  let w = ctx.measureText(text).width
  ctx.textBaseline = baseline
  if (blur) {
    ctx.save()
    ctx.shadowBlur = blur.blur
    ctx.shadowColor = blur.color
    ctx.shadowOffsetX = blur.x
    ctx.shadowOffsetX = blur.y
  }
  ctx.strokeStyle = outlinecolorpicker.value
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill
  ctx.fillText(text, x, y);
  //ctx.restore();
  if (blur) {
    ctx.restore()
  }
}

function wrapText(ctx, text, x, maxWidth, maxHeight, lineHeight) {
  if (!(text > ''))
    return
  let words = text.split(' ');
  let line = '';
  let lineWidth = 0;

  //let y = 0
  ctx.textBaseline = 'bottom'
  let lines = []
  //let w = 0
  for(let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let w = ctx.measureText(testLine).width;
    if (w > maxWidth) {
      lines.push(line.trim())
      //ctx.fillText(line, x, y);
      line = words[n] + ' ';
      lineWidth = ctx.measureText(line).width;
      //y -= lineHeight;
    } else {
      line = testLine;
      lineWidth = w;
    }
  }
  lines.push(line.trim())
  let y = maxHeight
  //let x = 0
  let w = 0
  for (let line of lines.reverse()) {
    w = Math.max(w, ctx.measureText(line).width)
    //drawStrokedText(ctx, line, (maxWidth - w)/2, y)
    y -= lineHeight
  }
  ctx.fillStyle = `rgba(0,0,0,${opacity.value/100})`
  const pad = 32
  const padv = 16
  const corner = 18
  roundRect(ctx,x + (maxWidth-w)/2-pad,y-padv,w+2*pad,maxHeight-y+2*padv, corner)

  ctx.fillStyle = colorpicker.value
  y = maxHeight
  for (let line of lines.reverse()) {
    const w = ctx.measureText(line).width
    drawStrokedText(ctx, line, x + (maxWidth - w)/2, y, colorpicker.value)
    //ctx.fillText(line,x + (maxWidth - w)/2, y)
    y -= lineHeight
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  //ctx.stroke();   

  ctx.fill();
}

function findCaptionAt(time) {
  let p = punctuated.querySelectorAll('span')
  let res = []
  const delta = 1000
  for (let w of p) {
    const highlight = w.start >= (time - delta) && w.end <= (time + delta)
    if (highlight)
      res.push(w.textContent)
    if (res.length > 10)
      break
  }
  return res
}

function drawVideo() {
  let w = canvas.width
  let h = vh * w / vw
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(realplayer,0,0,vw,vh,0,0,w,h)
  const padLeft = 64
  const padBottom = 64
  const caption = uppercase.checked ? currentCaption.join('').toUpperCase() : currentCaption.join('')
  wrapText(ctx, caption, padLeft, w - 2 * padLeft, h - padBottom, fontSize.value * 1.2)
  const pad = 32
  drawStrokedText(ctx,author.value,pad,pad,'white', 'top', {blur: 4, x: 2, y: 2, color: 'black'})
  requestAnimationFrame(drawVideo)
}

async function getSummary(videoId, transcript, lang = 'en', vocab) {
  const key = [lang,'sum',videoId].join('-')
  let d = await localforage.getItem(key)
  if (d)
    return d
  const summaryPrompt = `
  - write a very short summary of the following video transcript
  - use this list of dictionary words: """${vocab}"""
  - write the summary in ${languageName(lang)}
  - answer in plain text without mentioning the language
  Transcript to summarize:
  """${transcript}"""`
  //const result = await model.generateContent([summaryPrompt])
  const result = await getModelAnswer(summaryPrompt)
  let summaryText = result.response.text()
  if (summaryText.indexOf(lang) === 0)
    summaryText = summaryText.substring(lang.length)
  localforage.setItem(key, summaryText)
  return summaryText
}
let vw = 0
let vh = 0

async function postData(url = "", data = {}) {
  const response = await fetch(url, {
    method: "POST",
    mode: "cors",
    cache: "no-cache",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    redirect: "follow",
    referrerPolicy: "no-referrer",
    body: JSON.stringify(data),
  });

  return response.json();
}
async function getUserData(videoId) {
  let data = await localforage.getItem(videoId)
  if (!data)
    data = {highlights:[]}
  if (!data.highlights)
    data.highlights = []
  let hash = window.location.hash
  if (hash > '') {
    let chunks = hash.substring(1).split(',')
    let hashHighlights = []
    for (let c of chunks) {
      let part = c.split('-')
      if (part.length === 2) {
        try {
          let start = parseInt(part[0])
          let end = parseInt(part[1])
          hashHighlights.push({start,end,hash:true})
        } catch (e) {}
      }
    }
    let combined = data.highlights.concat(hashHighlights)
    let unique = new Set(combined)
    data.highlights = [...unique.values()]
  }
  return data
}
function getTranscriptURLAndLanguage(yt, preferredLanguage = 'en') {
  const captions = yt.captions ? yt.captions.playerCaptionsTracklistRenderer : null
  if (!captions || !captions.captionTracks)
    return {defaultLanguage:'en',transcripts:{}}
  const idx = captions.defaultAudioTrackIndex ?? 0
  const audioTrack = captions.audioTracks[idx]
  let defaultCaptionTrackIndex = audioTrack.defaultCaptionTrackIndex ?? 0
  if (!defaultCaptionTrackIndex && audioTrack.captionTrackIndices && audioTrack.captionTrackIndices.length > 0)
    defaultCaptionTrackIndex = audioTrack.captionTrackIndices[0]
  const captionTrack = captions.captionTracks[defaultCaptionTrackIndex]
  const translatable = captions.captionTracks.filter(c => c.isTranslatable === true)
  let defaultLanguage = 'en'
  let obj = {}
  if (captionTrack) {
    defaultLanguage = captionTrack.languageCode
    if (defaultLanguage.indexOf('-') !== -1)
      defaultLanguage = defaultLanguage.split('-')[0]
    obj[defaultLanguage] = captionTrack.baseUrl
  }
  // for iOS, we always want the English track because the DistilBert only works with English for now
  if (!obj['en']) {
    if (captionTrack && captionTrack.isTranslatable) {
      obj['en'] = captionTrack.baseUrl + '&tlang=en'
    } else if (translatable.length > 0) {
      obj['en'] = translatable[0].baseUrl + '&tlang=en'
    }
  }
  if (preferredLanguage !== 'en') {
    if (captionTrack && captionTrack.isTranslatable) {
      obj[preferredLanguage] = captionTrack.baseUrl + '&tlang=' + preferredLanguage
    } else if (translatable.length > 0) {
      obj[preferredLanguage] = translatable[0].baseUrl + '&tlang=' + preferredLanguage
    }
  }
  const translationLanguages = {}
  if (captions.translationLanguages) {
    for (let l of captions.translationLanguages) {
      translationLanguages[l.languageCode] = l.languageName.simpleText
    }
  }
  return { defaultLanguage, transcripts: obj, translationLanguages }
}
async function getLocal(videoId, languageCode = 'en') {
  const data = await getUserData(videoId)
  if (data && data[languageCode]) {
    return data
  }
  const payload = {
    videoId,
      "context": {
          "client": {
              "hl": "en",
              "clientName": "WEB",
              "clientVersion": "2.20210721.00.00",
              "clientScreen": "WATCH",
              "mainAppWebInfo": {
                  "graftUrl": "/watch?v=" + videoId
              }
          },
          "user": {
              "lockedSafetyMode": false
          },
          "request": {
              "useSsl": true,
              "internalExperimentFlags": [],
              "consistencyTokenJars": []
          }
      },
      "playbackContext": {
          "contentPlaybackContext": {
              "vis": 0,
              "splay": false,
              "autoCaptionsDefaultOn": false,
              "autonavState": "STATE_NONE",
              "html5Preference": "HTML5_PREF_WANTS",
              "lactMilliseconds": "-1"
          }
      },
      "racyCheckOk": false,
      "contentCheckOk": false
  }
  // https://stackoverflow.com/questions/67615278/get-video-info-youtube-endpoint-suddenly-returning-404-not-found
  const json = await postData(
  "https://release-youtubei.sandbox.googleapis.com/youtubei/v1/player", payload)
  const obj = {}
  if (json.error || json.videoDetails === undefined)
    return {error: 'invalid video'}
  for (let s of json.streamingData.formats)
    console.log(decodeURIComponent(s.url))
  for (let s of json.streamingData.adaptiveFormats)
    console.log(decodeURIComponent(s.url))
  obj.videoId = json.videoDetails.videoId
  obj.chapters = json.videoDetails.chapters
  obj.title = json.videoDetails.title
  obj.description = json.videoDetails.shortDescription
  obj.viewCount = json.videoDetails.viewCount
  obj.duration = parseInt(json.videoDetails.lengthSeconds)
  if (json.microformat && json.microformat.playerMicroformatRenderer)
      obj.publishDate = json.microformat.playerMicroformatRenderer.publishDate
  obj.thumbnail = `https://img.youtube.com/vi/${obj.videoId}/mqdefault.jpg`
  const { defaultLanguage, transcripts, translationLanguages } = getTranscriptURLAndLanguage(json, languageCode)
  obj.translationLanguages = translationLanguages
  const languageCodes = Object.keys(transcripts)
  obj.defaultLanguage = defaultLanguage ?? 'en'
  //selectedLanguage = languages[languageCode]
  for (let languageCode in transcripts) {
    const chunks = await getChunks(transcripts[languageCode])
    obj[languageCode] = {chunks}
  }
  return obj
}
function formatXML(xml) {
  const docParser = new DOMParser()
  const doc = docParser.parseFromString(xml,'application/xml')
  let texts = doc.querySelectorAll('text')
  let chunks = []
  for (let t of texts) {
    let start = parseFloat(t.getAttribute('start')) * 1000
    let dur = parseFloat(t.getAttribute('dur')) * 1000
    if (isNaN(dur))
      dur = 0.01
    let end = start + dur
    let text = unescapeXml(t.textContent, docParser)
    text = removeDuplicates(text).replace(/\s+/g,' '); // Laurent added replace
    if (text > '') {
      chunks.push({text, start, end, dur })
    }
  }
  return chunks
}
function removeDuplicates(text) {
  //console.log(text)
  let result = text.replace(/\b([\w']+)\s+\1\b/g,'$1');
  result = result.replace(/\[.*\].?/g,'') // remove [MUSIC] etc
  //result = result.replace(/\[Music].?/gi,'') // remove [MUSIC] etc
  //console.log('without[music]=',result)
  if (result === 'um' || result === 'uh' || result === 'um,' || result === 'uh,')
    return ''
  if (result.indexOf('um ') === 0)
    result = result.substring(2)
  if (result.indexOf('um, ') === 0)
    result = result.substring(3)
  if (result.endsWith(' um'))
    result = result.substring(0,result.length-2)
  result = result.replaceAll(' um ',' ')
  result = result.replaceAll(' um, ',' ')
  if (result.indexOf('uh ') === 0)
    result = result.substring(2)
  if (result.indexOf('uh, ') === 0)
    result = result.substring(3)
  if (result.endsWith(' uh'))
    result = result.substring(0,result.length-2)
  result = result.replaceAll(' uh ',' ')
  result = result.replaceAll(' uh, ',' ')
  //console.log('res=',result)
  return result
}
function unescapeXml(escapedXml, parser) {
  const doc = parser.parseFromString(escapedXml, "text/html")
  return doc.documentElement.textContent;
}
async function fetchData(url) {
  const response = await fetch(url)
  const text = await response.text()
  return text
}
async function getChunks(url) {
  try {
    const transcript = await fetchData(url)
    return formatXML(transcript)
  } catch (e) {
    return []
  }
}
async function punctuate(videoId, languageCode = 'en') {
  //let json = await (await fetch('/ytt?id=' + videoid + '&language=' + language)).json()
  let json = await getLocal(videoId, languageCode)
  window.json = json
  if (json.error) {
    container.style.display = 'none'
    items.innerHTML = '<b>No transcript for this video</b>'
    return
  }
  window.json = json
  chapters =  parseYTChapters(json.chapters) ?? []
  if (chapters.length === 0)
    chapters = computeChapters(json.description)
  vtitle.innerHTML = `<a href="https://www.youtube.com/watch?v=${videoId}" target="_blank">${json.title}</a>`
  window.document.title = 'Scribe - ' + json.title
  realplayer.ontimeupdate = (evt) => audioTimeUpdate(realplayer.currentTime)
  realplayer.onloadedmetadata = (evt) => {
    realplayer.currentTime = 0.5
    timeline.max = realplayer.duration * 1000
    timeline.addEventListener('input',() => {
      updateTimeCaption(timeline.value / 1000)
      currentCaption = findCaptionAt(timeline.value)
      drawVideo()
    })
    timeline.addEventListener('change',() => {
      updateTimeCaption(timeline.value / 1000)
      userJumps = true
      currentCaption = findCaptionAt(timeline.value)
      drawVideo()
      realplayer.currentTime = timeline.value / 1000
    })

    vw = realplayer.videoWidth
    vh = realplayer.videoHeight
    canvas.width = 1280
    canvas.height = 720
    console.log(realplayer.videoWidth, realplayer.videoHeight)
    ctx.font = `${fontWeight.value} ${fontSize.value}px ` + currentFont
    ctx.fillStyle = 'rgb(245,220,51)'
    drawVideo()
  }
  realplayer.src = json.videoUrl
  json.chunks = json[languageCode].chunks
  json.text = json.chunks.map(c => c.text).join(' ')
  let transcript = json.text
  window.originalText = transcript
  videoDuration = json.duration

  const videoTitle = json.title || ''
  const videoDescription = json.description || ''
  const vocab = await createVocabulary(videoid, videoTitle + ' ' + videoDescription, languageCode)
  //chapterize(transcript)
  let wordTimes = prepareWords(createChunks(json.chunks))
  const summaryText = await getSummary(videoid, transcript, languageCode, vocab)
  summary.innerHTML = marked(summaryText)

  punctuated.innerHTML = '<p><i>Transcribing...</i></p>'
  let startTime = Date.now()
  let chunks = chunkText(transcript, chunkSize)
  console.log('n chunks=',chunks.length)
  const DEBUG = false//window.location.hostname === 'localhost'
  const puncKey = languageCode + '-punc-' + videoId
  const prevPunctuatedText = await localforage.getItem(puncKey)
  if (!DEBUG && prevPunctuatedText) {
    let punctuatedText = prevPunctuatedText
    let punctuatedTimes = testDiff(wordTimes, punctuatedText)
    punctuated.innerHTML = ''
    buildWords(punctuatedTimes)
    return
  }
  let promises = []
  let i = 0
  for (let c of chunks) {
    let p = punctuateText(c, vocab, languageCode)
    promises.push(p)
  }
  let res = await Promise.all(promises);
  if (res.length === 0) {
    punctuated.innerHTML = 'No transcript was found'
    return
  } else if (res.length === 1) {
    let punctuatedText = res[0]
    localforage.setItem(puncKey, punctuatedText)
    let punctuatedTimes = testDiff(wordTimes, punctuatedText)
    punctuated.innerHTML = ''
    buildWords(punctuatedTimes)
    return
  }
  let merges = []
  let parts = []
  for (let i=0;i<res.length-1;i++) {
    let a = findChunkEnd(res[i])
    let b = findChunkStart(res[i+1])
    if (i < res.length - 2) {
      let t = findChunkEnd(b.paragraph)
      b.paragraph = t.paragraph
    }
    parts.push({left:a.paragraph, right: b.paragraph})
    let merged = mergeSentences(a.end,b.start, vocab, languageCode)
    merges.push(merged)
  }
  console.log('waiting for merges',merges.length)
  let fragments = await Promise.all(merges)
  let punctuatedText = parts[0].left
  for (let i=0;i<fragments.length;i++) {
    //console.log(i, parts[i])
    punctuatedText += ' ' + fragments[i] + ' ' + parts[i].right
  }
  punctuatedText = punctuatedText.replace(/,\s+/g,', ')
  localforage.setItem(puncKey, punctuatedText)
  let endTime = Date.now()
  console.log('duration=',endTime - startTime,json.duration)
  let punctuatedTimes = testDiff(wordTimes, punctuatedText)
  punctuated.innerHTML = ''
  buildWords(punctuatedTimes)
}

let videoDuration = 0
function scrollToLive() {
  let p = punctuated.querySelector('.livep')
  if (!p)
    return
  let y = p.getBoundingClientRect().top + window.pageYOffset - player.offsetHeight
  window.scrollTo({left: 0, top: y, behavior: 'smooth'})
}
const languageCode = params.get('language') || 'en'
let videoid = params.get('id') || params.get('v')
if (videoid) {
  myform.style.display = 'none'
  punctuate(videoid, languageCode)
} else {
  container.style.display = 'none'
}
myform.addEventListener('submit', (evt) => { absorb(evt); search(q.value) })

highlighter.onmousedown = (evt) => addHighlight(evt)
currentTime.onclick = (evt) => scrollToLive()

let currentFont = 'Montserrat'
const fonts = ["Courgette","system-ui","Arsenal","Montserrat","Lobster Two","Lobster","Satisfy","Gloria Hallelujah","Kaushan Script","Covered By Your Grace","Abril Fatface","Righteous","Orbitron","Pacifico"];
for(let f of fonts){
  let prop = document.createElement('div')
  prop.className = 'prop'
  prop.style.fontFamily = f
  prop.textContent = f
  if (f === currentFont)
    prop.classList.add('selected')
  prop.onclick = (evt) => {
    currentFont = prop.textContent
    //author.style.fontFamily = currentFont
    ctx.font = `${fontWeight.value} ${fontSize.value}px ${currentFont}`
    fontlist.querySelectorAll('.prop').forEach(p => {
      if (p.textContent === currentFont)
        p.classList.add('selected')
      else
        p.classList.remove('selected')
    })
  }
  fontlist.appendChild(prop)
}
createvideo.onclick = (evt) => {
  absorb(evt)
  if (highlights.length === 0)
    return alert(`Please highlight a few passages you'd like to cite`)
  lastStart = null
  play(highlights[0].start * 100)
}
fontSize.oninput = () => ctx.font = `${fontWeight.value} ${fontSize.value}px ` + currentFont
fontWeight.oninput = () => ctx.font = `${fontWeight.value} ${fontSize.value}px ` + currentFont