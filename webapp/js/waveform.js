function useWaveform(audioRef, onReady) {
  const { useRef, useEffect } = React;
  const waveformRef = useRef(null);
  const waveRef = useRef(null);
  useEffect(() => {
    if (!audioRef.current) return;
    if (waveRef.current) waveRef.current.destroy();
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'lightblue',
      progressColor: 'blue',
      cursorColor: 'red',
      responsive: true,
      normalize: true,
    });
    waveRef.current = wavesurfer;
    wavesurfer.load(audioRef.current);
    let rafId;
    const center = () => {
      const pxPerSec = wavesurfer.params.minPxPerSec;
      const current = wavesurfer.getCurrentTime();
      const half = waveformRef.current.clientWidth / 2;
      const scroll = pxPerSec * current - half;
      waveformRef.current.scrollLeft = Math.max(0, scroll);
    };
    const render = () => {
      center();
      rafId = requestAnimationFrame(render);
    };
    wavesurfer.on('ready', () => {
      const pxPerSec = waveformRef.current.clientWidth / 5;
      wavesurfer.zoom(pxPerSec);
      onReady && onReady(wavesurfer);
      render();
    });
    const handleWheel = e => {
      e.preventDefault();
      const delta = e.deltaY * -0.01;
      let newZoom = wavesurfer.params.minPxPerSec + delta * 10;
      newZoom = Math.max(20, Math.min(400, newZoom));
      wavesurfer.zoom(newZoom);
      center();
    };
    waveformRef.current.addEventListener('wheel', handleWheel);
    return () => {
      waveformRef.current.removeEventListener('wheel', handleWheel);
      cancelAnimationFrame(rafId);
      wavesurfer.destroy();
    };
  }, [audioRef.current]);
  return [waveformRef, waveRef];
}
