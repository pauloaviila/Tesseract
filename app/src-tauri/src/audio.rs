use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Raw decoded audio: interleaved f32 samples, sample rate, channel count.
pub struct DecodedAudio {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: usize,
    pub duration_secs: f64,
}

/// Decode any audio file (WAV/FLAC/MP3/AAC) to interleaved f32 samples.
pub fn decode_file(path: &Path) -> Result<DecodedAudio, String> {
    let file = std::fs::File::open(path)
        .map_err(|e| format!("cannot open file: {e}"))?;

    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("probe failed: {e}"))?;

    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("no audio track found")?
        .clone();

    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    let channels = track
        .codec_params
        .channels
        .map(|c| c.count())
        .unwrap_or(2);

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("decoder error: {e}"))?;

    let mut all_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) if p.track_id() == track_id => p,
            Ok(_) => continue,
            Err(Error::IoError(_)) | Err(Error::ResetRequired) => break,
            Err(e) => return Err(format!("packet error: {e}")),
        };

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let mut sample_buf =
                    SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
                sample_buf.copy_interleaved_ref(decoded);
                all_samples.extend_from_slice(sample_buf.samples());
            }
            Err(Error::IoError(_)) => break,
            Err(e) => return Err(format!("decode error: {e}")),
        }
    }

    let duration_secs = (all_samples.len() / channels) as f64 / sample_rate as f64;

    Ok(DecodedAudio {
        samples: all_samples,
        sample_rate,
        channels,
        duration_secs,
    })
}

/// Mix interleaved stereo down to mono by averaging channels.
pub fn to_mono(audio: &DecodedAudio) -> Vec<f32> {
    if audio.channels == 1 {
        return audio.samples.clone();
    }
    let ch = audio.channels;
    audio
        .samples
        .chunks_exact(ch)
        .map(|frame| frame.iter().sum::<f32>() / ch as f32)
        .collect()
}

/// Compute peak envelope for waveform display.
/// Returns `resolution` pairs of (min, max) normalised to [-1.0, 1.0].
pub fn compute_peaks(mono: &[f32], resolution: usize) -> Vec<(f32, f32)> {
    if mono.is_empty() || resolution == 0 {
        return vec![];
    }
    let chunk_size = (mono.len() / resolution).max(1);
    mono.chunks(chunk_size)
        .take(resolution)
        .map(|chunk| {
            let min = chunk.iter().cloned().fold(f32::INFINITY, f32::min);
            let max = chunk.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
            (min, max)
        })
        .collect()
}
