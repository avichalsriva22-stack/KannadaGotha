import numpy as np
from audio_util import (
    AudioRingBuffer,
    bytes_to_float32,
    downsample_to_16k,
    is_silent,
)


def test_bytes_to_float32_strips_trailing_junk():
    samples = np.array([0.1, -0.2, 0.3], dtype=np.float32)
    payload = samples.tobytes() + b"\x01\x02"
    result = bytes_to_float32(payload)
    np.testing.assert_array_almost_equal(result, samples)


def test_bytes_to_float32_empty():
    result = bytes_to_float32(b"")
    assert result.size == 0
    assert result.dtype == np.float32


def test_downsample_48k_to_16k_preserves_length_ratio():
    # 48000 samples at 48 kHz = 1 second → 16000 samples at 16 kHz
    sine = np.sin(2 * np.pi * 440 * np.arange(48000) / 48000).astype(np.float32)
    resampled = downsample_to_16k(sine, 48000)
    assert resampled.dtype == np.float32
    assert abs(resampled.size - 16000) <= 1


def test_ring_buffer_concatenates_chunks_and_reports_size():
    buf = AudioRingBuffer()
    buf.append(np.array([0.1, 0.2], dtype=np.float32))
    buf.append(np.array([0.3, 0.4, 0.5], dtype=np.float32))
    assert buf.size == 5
    np.testing.assert_array_almost_equal(
        buf.samples(),
        np.array([0.1, 0.2, 0.3, 0.4, 0.5], dtype=np.float32),
    )


def test_take_window_returns_window_and_keeps_overlap():
    buf = AudioRingBuffer()
    buf.append(np.arange(24000, dtype=np.float32))
    window = buf.take_window(24000, keep=12000)
    assert window.size == 24000
    np.testing.assert_array_almost_equal(window, np.arange(24000, dtype=np.float32))
    assert buf.size == 12000
    np.testing.assert_array_almost_equal(
        buf.samples(),
        np.arange(12000, 24000, dtype=np.float32),
    )


def test_drop_oldest_to_keeps_newest_samples():
    buf = AudioRingBuffer()
    buf.append(np.arange(60000, dtype=np.float32))
    buf.drop_oldest_to(48000)
    assert buf.size == 48000
    np.testing.assert_array_almost_equal(
        buf.samples(),
        np.arange(12000, 60000, dtype=np.float32),
    )


def test_is_silent_true_for_near_zeros():
    zeros = np.zeros(24000, dtype=np.float32)
    hush = np.full(24000, 0.001, dtype=np.float32)
    assert is_silent(zeros) is True
    assert is_silent(hush) is True


def test_is_silent_false_for_audible_sine():
    sine = (0.2 * np.sin(2 * np.pi * 440 * np.arange(24000) / 16000)).astype(np.float32)
    assert is_silent(sine) is False


if __name__ == "__main__":
    test_bytes_to_float32_strips_trailing_junk()
    test_bytes_to_float32_empty()
    test_downsample_48k_to_16k_preserves_length_ratio()
    test_ring_buffer_concatenates_chunks_and_reports_size()
    test_take_window_returns_window_and_keeps_overlap()
    test_drop_oldest_to_keeps_newest_samples()
    test_is_silent_true_for_near_zeros()
    test_is_silent_false_for_audible_sine()
    print("ok")
