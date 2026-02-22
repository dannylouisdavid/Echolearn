import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';

const AUDIO_TRACKS = [
    { title: "White Noise", uri: "https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg" }, // Placeholder public URL
    { title: "Rain", uri: "https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg" },
];

export function useFocusAudio() {
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

    async function playSound(index = 0) {
        if (sound) {
            await sound.unloadAsync();
        }

        const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: AUDIO_TRACKS[index].uri },
            { shouldPlay: true, isLooping: true }
        );
        setSound(newSound);
        setIsPlaying(true);
        setCurrentTrackIndex(index);
    }

    async function stopSound() {
        if (sound) {
            await sound.stopAsync();
            setIsPlaying(false);
        }
    }

    useEffect(() => {
        return sound
            ? () => {
                sound.unloadAsync();
            }
            : undefined;
    }, [sound]);

    return {
        isPlaying,
        currentTrack: AUDIO_TRACKS[currentTrackIndex],
        tracks: AUDIO_TRACKS,
        playSound,
        stopSound
    };
}
