// Simple Web Audio API Synthesizer (No external audio files needed!)
export function playSuccessChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // Two pleasant ascending notes (C5 -> G5)
    const notes = [523.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);

      gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.12);
      osc.stop(ctx.currentTime + idx * 0.12 + 0.25);
    });
  } catch (err) {
    console.warn('Audio chime could not play:', err);
  }
}

export function speakStudentName(name: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    const utterance = new SpeechSynthesisUtterance(`${name}, marked present`);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis not available:', err);
  }
}
