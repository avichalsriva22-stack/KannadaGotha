import numpy as np

WHISPER_SAMPLE_RATE = 16000
WINDOW_SAMPLES = 48000
OVERLAP_SAMPLES = 16000
MAX_PENDING_SAMPLES = 64000
SILENCE_RMS = 0.01


class AudioRingBuffer:
    """Append-only float32 buffer that can take a window and drop old samples."""

    def __init__(self):
        self._data = np.array([], dtype=np.float32)

    @property
    def size(self) -> int:
        return int(self._data.size)

    def samples(self) -> np.ndarray:
        return self._data

    def append(self, chunk: np.ndarray) -> None:
        if chunk.size == 0:
            return
        piece = np.asarray(chunk, dtype=np.float32)
        if self._data.size == 0:
            self._data = piece.copy()
        else:
            self._data = np.concatenate((self._data, piece))

    def take_window(self, window: int, keep: int) -> np.ndarray:
        taken = self._data[:window].copy()
        self._data = self._data[window - keep:]
        return taken

    def drop_oldest_to(self, max_samples: int) -> None:
        if self._data.size > max_samples:
            self._data = self._data[-max_samples:]


def is_silent(samples: np.ndarray, threshold: float = SILENCE_RMS) -> bool:
    if samples.size == 0:
        return True
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float32))))
    return rms < threshold


def bytes_to_float32(data: bytes) -> np.ndarray:
    """Convert a raw WebSocket payload to float32 samples, ignoring trailing junk bytes."""
    leftover = len(data) % 4
    if leftover:
        data = data[: len(data) - leftover]
    if not data:
        return np.array([], dtype=np.float32)
    return np.frombuffer(data, dtype=np.float32).copy()


def downsample_to_16k(samples: np.ndarray, input_rate: int) -> np.ndarray:
    """Resample float32 audio to Whisper's 16 kHz if needed."""
    if samples.size == 0 or input_rate == WHISPER_SAMPLE_RATE:
        return samples.astype(np.float32, copy=False)
    if input_rate <= 0:
        return samples.astype(np.float32, copy=False)

    duration = samples.size / float(input_rate)
    target_length = int(round(duration * WHISPER_SAMPLE_RATE))
    if target_length <= 1:
        return np.array([], dtype=np.float32)

    source_x = np.linspace(0.0, 1.0, samples.size, endpoint=False)
    target_x = np.linspace(0.0, 1.0, target_length, endpoint=False)
    return np.interp(target_x, source_x, samples).astype(np.float32)
