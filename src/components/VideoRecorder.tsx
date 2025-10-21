import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Play, Square, Camera, Mic, Monitor, AlertTriangle } from "lucide-react";

interface VideoRecorderProps {
  sessionId: string;
  onRecordingStart?: () => void;
  onRecordingStop?: (blob: Blob, checksum: string) => void;
  onError?: (error: string) => void;
}

const VideoRecorder = ({ sessionId, onRecordingStart, onRecordingStop, onError }: VideoRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<any>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    checkPermissions();
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      stopAllStreams();
    };
  }, []);

  const checkPermissions = async () => {
    try {
      // Check camera permission
      const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      const microphonePermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      
      if (cameraPermission.state === 'granted' && microphonePermission.state === 'granted') {
        setHasPermissions(true);
      } else {
        setError("Camera and microphone permissions are required for exam monitoring");
      }
    } catch (error) {
      console.warn("Permission API not supported, will request permissions when starting recording");
      setHasPermissions(true);
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      
      // Request screen capture
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          cursor: 'always'
        },
        audio: true
      });

      // Request webcam and microphone
      const webcamStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      screenStreamRef.current = screenStream;
      webcamStreamRef.current = webcamStream;

      // Combine streams
      const combinedStream = new MediaStream();
      
      // Add screen video track
      screenStream.getVideoTracks().forEach(track => {
        combinedStream.addTrack(track);
      });
      
      // Add webcam video track
      webcamStream.getVideoTracks().forEach(track => {
        combinedStream.addTrack(track);
      });
      
      // Add audio track (prefer screen audio, fallback to webcam)
      const audioTracks = screenStream.getAudioTracks().length > 0 
        ? screenStream.getAudioTracks() 
        : webcamStream.getAudioTracks();
      
      audioTracks.forEach(track => {
        combinedStream.addTrack(track);
      });

      // Create recorder
      const recorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 1000000,
        audioBitsPerSecond: 128000
      });

      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const checksum = await calculateChecksum(blob);
        
        if (onRecordingStop) {
          onRecordingStop(blob, checksum);
        }
      };

      recorder.onerror = (event) => {
        console.error('Recording error:', event);
        setError('Recording failed. Please try again.');
        stopRecording();
      };

      // Handle stream end events
      screenStream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          toast.warning("Screen sharing ended. Recording stopped.");
          stopRecording();
        });
      });

      webcamStream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          toast.warning("Camera access ended. Recording stopped.");
          stopRecording();
        });
      });

      recorderRef.current = recorder;
      recorder.start(1000); // Collect data every second
      
      setIsRecording(true);
      startTimeRef.current = Date.now();
      
      // Start timer
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(elapsed);
        setRecordingProgress((elapsed / 3600) * 100); // Progress over 1 hour
      }, 1000);

      if (onRecordingStart) {
        onRecordingStart();
      }

      toast.success("Recording started successfully");
    } catch (error) {
      console.error('Error starting recording:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start recording';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.stop();
      setIsRecording(false);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      stopAllStreams();
      toast.success("Recording stopped");
    }
  };

  const stopAllStreams = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(track => track.stop());
      webcamStreamRef.current = null;
    }
  };

  const calculateChecksum = async (blob: Blob): Promise<string> => {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Recording Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={checkPermissions} variant="outline">
            Check Permissions Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Exam Recording
        </CardTitle>
        <CardDescription>
          Your screen and webcam are being recorded for exam integrity
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Badge variant={isRecording ? "destructive" : "secondary"} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`} />
              {isRecording ? 'RECORDING' : 'STOPPED'}
            </Badge>
            
            {isRecording && (
              <div className="text-sm font-mono">
                {formatTime(recordingTime)}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isRecording ? (
              <Button onClick={startRecording} disabled={!hasPermissions}>
                <Play className="mr-2 h-4 w-4" />
                Start Recording
              </Button>
            ) : (
              <Button onClick={stopRecording} variant="destructive">
                <Square className="mr-2 h-4 w-4" />
                Stop Recording
              </Button>
            )}
          </div>
        </div>

        {isRecording && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Recording Progress</span>
              <span>{recordingProgress.toFixed(1)}%</span>
            </div>
            <Progress value={recordingProgress} className="h-2" />
          </div>
        )}

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Monitor className="h-4 w-4" />
            Screen
          </div>
          <div className="flex items-center gap-1">
            <Camera className="h-4 w-4" />
            Webcam
          </div>
          <div className="flex items-center gap-1">
            <Mic className="h-4 w-4" />
            Audio
          </div>
        </div>

        {!hasPermissions && (
          <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
            <p className="text-sm text-warning-foreground">
              Please allow camera, microphone, and screen sharing permissions to start recording.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VideoRecorder;
