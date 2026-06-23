import audioDefinitions from '../data/audio_definitions.json';

let currentMusic: HTMLAudioElement | null = null;
let currentMusicKey: string | null = null;

/**
 * Triggers a sound event by looking up the path in audio_definitions.json.
 * Safe to call in any environment (safeguarded against headless/node testing).
 */
export function playAudioEvent(eventType: string): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return;
  }

  const soundPath = (audioDefinitions as any)[eventType];
  if (!soundPath) return;

  try {
    const audio = new Audio(soundPath);
    audio.volume = 0.5;
    audio.play().catch(err => {
      // Browser autoplay policies may block this until a user gesture occurs
      console.warn(`Audio play blocked or failed for event "${eventType}":`, err);
    });
  } catch (e) {
    console.error(`Failed to play sound event "${eventType}":`, e);
  }
}

/**
 * Plays background music loop for a given zone. Stops any playing track if different.
 * Safe to call in headless/node testing environment.
 */
export function playZoneMusic(zoneKey: string): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return;
  }

  const musicEventKey = `music_${zoneKey}`;
  const musicPath = (audioDefinitions as any)[musicEventKey];
  if (!musicPath) return;

  if (currentMusicKey === musicEventKey) {
    return; // Already playing this track
  }

  // Stop previous track
  if (currentMusic) {
    try {
      currentMusic.pause();
    } catch (e) {
      console.error('Failed to pause current music:', e);
    }
    currentMusic = null;
  }

  try {
    currentMusic = new Audio(musicPath);
    currentMusic.loop = true;
    currentMusic.volume = 0.25; // Slightly lower volume for background music
    currentMusicKey = musicEventKey;
    currentMusic.play().catch(err => {
      console.warn(`Music play blocked or failed for zone "${zoneKey}":`, err);
    });
  } catch (e) {
    console.error(`Failed to start music for zone "${zoneKey}":`, e);
  }
}
