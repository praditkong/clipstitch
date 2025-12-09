import { VideoFile, ProcessingProgress } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, VIDEO_FRAME_RATE } from '../constants';

/**
 * Stitch videos together sequentially using Canvas recording.
 * Note: This runs in real-time or near real-time relative to the video duration
 * because we must play the videos to capture frames.
 */
export const stitchVideos = async (
  videos: VideoFile[],
  onProgress: (progress: ProcessingProgress) => void
): Promise<Blob> => {
  if (videos.length === 0) {
    throw new Error("No videos to stitch");
  }

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error("Could not create canvas context");

  // Fill black background initially
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // --- Audio Setup ---
  // Create AudioContext to capture and mix audio
  const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
  const audioCtx = new AudioContextClass();
  
  // Create a destination node to capture the audio stream
  const dest = audioCtx.createMediaStreamDestination();
  
  // Ensure context is running (required by some browsers)
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  // -------------------

  // Get video stream from canvas
  const canvasStream = canvas.captureStream(VIDEO_FRAME_RATE);
  
  // Combine video tracks from canvas and audio tracks from the audio destination
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks()
  ]);

  // Determine the best supported mime type, prioritizing MP4
  const mimeTypes = [
    'video/mp4;codecs=avc1,mp4a.40.2', // Standard MP4 (H.264 + AAC)
    'video/mp4;codecs=avc1',            // MP4 Video only or default audio
    'video/mp4',                        // Generic MP4
    'video/webm;codecs=h264',           // WebM with H.264 (often readable as mp4 by some players)
    'video/webm;codecs=vp9,opus',       // High quality WebM
    'video/webm'                        // Fallback
  ];

  let selectedMimeType = '';
  for (const type of mimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      selectedMimeType = type;
      break;
    }
  }

  // Fallback if strictly nothing in the list is supported (unlikely in modern browsers)
  if (!selectedMimeType) {
    selectedMimeType = 'video/webm'; 
  }

  console.log(`Using mime type: ${selectedMimeType}`);

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType: selectedMimeType
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  mediaRecorder.start();

  // Process each video sequentially
  for (let i = 0; i < videos.length; i++) {
    const videoFile = videos[i];
    
    onProgress({
      currentClipIndex: i + 1,
      totalClips: videos.length,
      statusMessage: `กำลังประมวลผลคลิปที่ ${i + 1}: ${videoFile.name}...`
    });

    await playVideoToCanvas(videoFile.file, ctx, canvas.width, canvas.height, audioCtx, dest);
  }

  onProgress({
    currentClipIndex: videos.length,
    totalClips: videos.length,
    statusMessage: "กำลังรวมไฟล์ขั้นสุดท้าย..."
  });

  // Stop recording and wait for the final blob
  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      // Create the blob with the actual mime type used
      const blob = new Blob(chunks, { type: selectedMimeType });
      // Close audio context to free resources
      if (audioCtx.state !== 'closed') {
        await audioCtx.close();
      }
      resolve(blob);
    };
    mediaRecorder.stop();
  });
};

const playVideoToCanvas = (
  file: File, 
  ctx: CanvasRenderingContext2D, 
  width: number, 
  height: number,
  audioCtx: AudioContext,
  destNode: MediaStreamAudioDestinationNode
): Promise<void> => {
  return new Promise((resolve, reject) => {
    let source: MediaElementAudioSourceNode | null = null;
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    
    // IMPORTANT: 
    // 1. muted must be false for createMediaElementSource to capture audio.
    // 2. We do NOT connect the source to audioCtx.destination, so the user won't hear it locally.
    video.muted = false; 
    
    video.crossOrigin = "anonymous";
    video.playsInline = true;
    video.volume = 1.0;

    // Helper to calculate aspect ratio fit
    const drawFrame = () => {
      if (video.paused || video.ended) return;

      // Draw background again to clear previous frame (and handle aspect ratio letters boxing)
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // Calculate scale to fit
      const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
      const w = video.videoWidth * scale;
      const h = video.videoHeight * scale;
      const x = (width - w) / 2;
      const y = (height - h) / 2;

      ctx.drawImage(video, x, y, w, h);
      
      requestAnimationFrame(drawFrame);
    };

    video.onloadedmetadata = () => {
      try {
        // Create a source from the video element and connect it to the recording destination
        source = audioCtx.createMediaElementSource(video);
        source.connect(destNode);
      } catch (e) {
        console.warn("Audio setup failed for clip, proceeding without audio for this clip:", e);
      }

      video.play().then(() => {
        drawFrame();
      }).catch(reject);
    };

    video.onended = () => {
      // Cleanup audio connection
      if (source) {
        source.disconnect();
      }
      URL.revokeObjectURL(video.src);
      resolve();
    };

    video.onerror = (e) => {
      if (source) {
        source.disconnect();
      }
      reject(e);
    };
  });
};