const { useState, useRef, useEffect } = React;

function App() {
  const [audio, setAudio] = useState(null);
  const [videos, setVideos] = useState([]);
  const [timestamps, setTimestamps] = useState('');
  const [order, setOrder] = useState([]);
  const [audioStart, setAudioStart] = useState(0);
  const [audioEnd, setAudioEnd] = useState(null);
  const [videoAspect, setVideoAspect] = useState(null);
  const [maxComb, setMaxComb] = useState('');

  const audioRef = useRef();
  const canvasRef = useRef();
  const [waveformRef, waveRef] = useWaveform(audioRef, null);

  const generateThumb = url => new Promise(resolve => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.onloadeddata = () => {
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d');
      v.currentTime = 0;
      v.onseeked = () => {
        ctx.drawImage(v,0,0,c.width,c.height);
        resolve(c.toDataURL('image/png'));
      };
    };
  });

  const handleAudioUpload = e => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudio({ file, url });
    }
  };

  const handleVideoUpload = async e => {
    const files = Array.from(e.target.files);
    const vids = [];
    for (const f of files) {
      const url = URL.createObjectURL(f);
      const thumb = await generateThumb(url);
      vids.push({ file: f, url, thumb });
    }
    setVideos(vids);
    setOrder(vids.map((_, i) => i));
    // determine aspect from first video
    const v = document.createElement('video');
    v.onloadedmetadata = () => {
      setVideoAspect(v.videoWidth / v.videoHeight);
    };
    v.src = vids[0].url;
  };

  const shuffleOrder = () => {
    setOrder(prev => [...prev].sort(() => Math.random() - 0.5));
  };

  const durations = () => {
    const ts = timestamps
      .split(',')
      .map(t => parseFloat(t.trim()))
      .filter(n => !isNaN(n));
    const dur = [];
    for (let i = 0; i < ts.length; i++) {
      dur.push(i === 0 ? ts[0] : ts[i] - ts[i - 1]);
    }
    return dur;
  };

  const timeline = () => (
    <div className="flex space-x-1 overflow-x-auto border p-1">
      {order.map((idx, i) => (
        <img
          key={i}
          src={videos[idx]?.thumb}
          className="w-20 h-12 object-cover"
        />
      ))}
    </div>
  );

  const preview = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ds = durations();
    let idx = 0;
    const drawNext = () => {
      if (idx >= ds.length || idx >= order.length) return;
      const v = document.createElement('video');
      v.src = videos[order[idx]].url;
      v.muted = true;
      v.onloadeddata = () => {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        v.currentTime = 0;
        v.onseeked = () => {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          idx++;
          setTimeout(drawNext, 500);
        };
      };
    };
    drawNext();
  };

  const renderOutput = async () => {
    const ds = durations();
    if (!ds.length || !videos.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream();
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const audioEl = audioRef.current;
    let source;
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = audioStart;
      const src = audioCtx.createMediaElementSource(audioEl);
      src.connect(dest);
      src.connect(audioCtx.destination);
      source = src;
    }
    const mixedStream = new MediaStream([
      ...stream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    let recorder;
    try {
      recorder = new MediaRecorder(mixedStream);
    } catch (e) {
      alert('MediaRecorder not supported');
      return;
    }
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.start();
    audioEl && audioEl.play();
    const aspect = videoAspect;
    for (let i = 0; i < ds.length && i < order.length; i++) {
      await new Promise(resolve => {
        const video = document.createElement('video');
        video.src = videos[order[i]].url;
        video.muted = true;
        video.onloadeddata = () => {
          const w = video.videoWidth;
          const h = video.videoHeight;
          canvas.width = w;
          canvas.height = h;
          const rate = video.duration / ds[i];
          video.playbackRate = rate;
          video.play();
          const start = performance.now();
          const durationMs = ds[i] * 1000;
          const draw = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            if (performance.now() - start < durationMs) {
              requestAnimationFrame(draw);
            } else {
              video.pause();
              resolve();
            }
          };
          draw();
        };
      });
    }
    recorder.stop();
    const stopPromise = new Promise(r => {
      recorder.onstop = r;
    });
    await stopPromise;
    audioEl && audioEl.pause();
    if (audioEnd) {
      if (audioEl.currentTime < audioEnd) {
        await new Promise(res => {
          const check = () => {
            if (audioEl.currentTime >= audioEnd) {
              res();
            } else {
              requestAnimationFrame(check);
            }
          };
          check();
        });
      }
    }
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const vid = document.createElement('video');
    vid.controls = true;
    vid.src = url;
    const out = document.getElementById('output');
    out.innerHTML = '';
    out.appendChild(vid);
  };

  return (
    <div className="space-y-4">
      <div className="flex space-x-4">
        <input type="file" accept="audio/*" onChange={handleAudioUpload} />
        <input type="file" accept="video/*" multiple onChange={handleVideoUpload} />
      </div>
      <input
        type="text"
        value={timestamps}
        onChange={e => setTimestamps(e.target.value)}
        placeholder="Comma-separated timestamps"
        className="w-full p-2 border"
      />
      <input
        type="number"
        value={maxComb}
        onChange={e => setMaxComb(e.target.value)}
        placeholder="Max combinations (optional)"
        className="w-full p-2 border"
      />
      <div className="flex space-x-2">
        <button className="px-4 py-2 bg-gray-300" onClick={shuffleOrder}>Shuffle</button>
        <button className="px-4 py-2 bg-gray-300" onClick={preview}>Preview</button>
        <button className="px-4 py-2 bg-blue-500 text-white" onClick={renderOutput}>Render</button>
      </div>
      {videos.length > 0 && timeline()}
      {audio && (
        <div>
          <audio ref={audioRef} src={audio.url} controls className="w-full" />
          <div ref={waveformRef} className="w-full h-24 overflow-hidden"></div>
          <div className="flex space-x-2 mt-2">
            <button
              className="px-2 py-1 bg-gray-200"
              onClick={() => {
                setTimestamps(timestamps + (timestamps ? ',' : '') + audioRef.current.currentTime.toFixed(2));
              }}
            >
              Add Timestamp
            </button>
            <button className="px-2 py-1 bg-gray-200" onClick={() => setAudioStart(audioRef.current.currentTime)}>
              Set Start
            </button>
            <button className="px-2 py-1 bg-gray-200" onClick={() => setAudioEnd(audioRef.current.currentTime)}>
              Set End
            </button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="w-full border h-64"></canvas>
      <div id="output" className="mt-4"></div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));
