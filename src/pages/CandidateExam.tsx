import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import VideoRecorder from "@/components/VideoRecorder";
import { Clock, Save, CheckCircle, AlertTriangle, Monitor, Camera, Mic } from "lucide-react";

interface ExamSection {
  id: string;
  section_type: 'mcq' | 'theoretical' | 'practical';
  title: string;
  timer_minutes: number;
  section_order: number;
  questions: ExamQuestion[];
}

interface ExamQuestion {
  id: string;
  question_text: string;
  question_order: number;
  options?: string[];
  correct_answer?: string;
  points: number;
}

interface CandidateAnswer {
  question_id: string;
  answer_text?: string;
  selected_option?: string;
  code_submission?: any;
}

const CandidateExam = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  
  const [session, setSession] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [sections, setSections] = useState<ExamSection[]>([]);
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<string, CandidateAnswer>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingChecksum, setRecordingChecksum] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (sessionId) {
      loadExamData();
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current);
    };
  }, [sessionId]);

  useEffect(() => {
    if (sections.length > 0 && currentSection < sections.length) {
      startSectionTimer();
    }
  }, [currentSection, sections]);

  useEffect(() => {
    // Auto-save answers every 30 seconds
    autoSaveIntervalRef.current = setInterval(() => {
      saveAnswers();
    }, 30000);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [answers]);

  const loadExamData = async () => {
    try {
      // Load session
      const { data: sessionData, error: sessionError } = await supabase
        .from("candidate_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (sessionError) throw sessionError;
      setSession(sessionData);

      // Load exam
      const { data: examData, error: examError } = await supabase
        .from("exams")
        .select("*")
        .eq("id", sessionData.exam_id)
        .single();

      if (examError) throw examError;
      setExam(examData);

      // Load sections and questions
      const { data: sectionsData, error: sectionsError } = await supabase
        .from("exam_sections")
        .select(`
          *,
          exam_questions(*)
        `)
        .eq("exam_id", examData.id)
        .order("section_order");

      if (sectionsError) throw sectionsError;

      const formattedSections = sectionsData.map(section => ({
        ...section,
        questions: section.exam_questions.map((q: any) => ({
          ...q,
          options: q.options ? JSON.parse(q.options) : undefined
        }))
      }));

      setSections(formattedSections);

      // Load existing answers
      const { data: answersData } = await supabase
        .from("candidate_answers")
        .select("*")
        .eq("session_id", sessionId);

      if (answersData) {
        const answersMap: Record<string, CandidateAnswer> = {};
        answersData.forEach(answer => {
          answersMap[answer.question_id] = {
            question_id: answer.question_id,
            answer_text: answer.answer_text,
            selected_option: answer.selected_option,
            code_submission: answer.code_submission
          };
        });
        setAnswers(answersMap);
      }

    } catch (error) {
      console.error("Error loading exam data:", error);
      toast.error("Failed to load exam. Please try again.");
      navigate("/candidate/register");
    } finally {
      setLoading(false);
    }
  };

  const startSectionTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    const section = sections[currentSection];
    setTimeRemaining(section.timer_minutes * 60);

    intervalRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleSectionTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSectionTimeout = () => {
    toast.warning(`Time's up for ${sections[currentSection].title}! Moving to next section.`);
    nextSection();
  };

  const nextSection = () => {
    if (currentSection < sections.length - 1) {
      setCurrentSection(prev => prev + 1);
    } else {
      // All sections completed
      setShowSubmitDialog(true);
    }
  };

  const saveAnswers = async () => {
    if (!sessionId) return;

    try {
      const answersToSave = Object.values(answers).filter(answer => 
        answer.answer_text || answer.selected_option || answer.code_submission
      );

      for (const answer of answersToSave) {
        const { error } = await supabase
          .from("candidate_answers")
          .upsert({
            session_id: sessionId,
            question_id: answer.question_id,
            answer_text: answer.answer_text,
            selected_option: answer.selected_option,
            code_submission: answer.code_submission,
            is_auto_saved: true
          });

        if (error) throw error;
      }
    } catch (error) {
      console.error("Error saving answers:", error);
    }
  };

  const updateAnswer = (questionId: string, field: keyof CandidateAnswer, value: any) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        question_id: questionId,
        [field]: value
      }
    }));
  };

  const handleRecordingStart = () => {
    setIsRecording(true);
    toast.success("Recording started - Exam monitoring is now active");
  };

  const handleRecordingStop = (blob: Blob, checksum: string) => {
    setRecordingBlob(blob);
    setRecordingChecksum(checksum);
    setIsRecording(false);
    toast.success("Recording completed and saved");
  };

  const submitExam = async () => {
    setSubmitting(true);
    
    try {
      // Save final answers
      await saveAnswers();

      // Update session status
      const { error: sessionError } = await supabase
        .from("candidate_sessions")
        .update({
          status: 'completed',
          submitted_at: new Date().toISOString(),
          recording_url: recordingChecksum // Store checksum for now
        })
        .eq("id", sessionId);

      if (sessionError) throw sessionError;

      toast.success("Exam submitted successfully!");
      navigate("/candidate/exam-complete");
    } catch (error) {
      console.error("Error submitting exam:", error);
      toast.error("Failed to submit exam. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getSectionTypeColor = (type: string) => {
    switch (type) {
      case "mcq": return "bg-blue-100 text-blue-800";
      case "theoretical": return "bg-green-100 text-green-800";
      case "practical": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading exam...</p>
        </div>
      </div>
    );
  }

  if (!session || !exam || sections.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="text-center py-8">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Exam Not Found</h3>
            <p className="text-muted-foreground mb-4">
              The exam session could not be loaded. Please contact support.
            </p>
            <Button onClick={() => navigate("/candidate/register")}>
              Return to Registration
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentSectionData = sections[currentSection];
  const progress = ((currentSection + 1) / sections.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{exam.title}</h1>
              <p className="text-sm text-muted-foreground">
                Section {currentSection + 1} of {sections.length}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Badge className={getSectionTypeColor(currentSectionData.section_type)}>
                {currentSectionData.section_type.toUpperCase()}
              </Badge>
              <div className="text-right">
                <div className="flex items-center gap-2 text-lg font-mono">
                  <Clock className="h-5 w-5" />
                  {formatTime(timeRemaining)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {currentSectionData.timer_minutes} minutes
                </div>
              </div>
            </div>
          </div>
          <Progress value={progress} className="mt-2" />
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-4">
          {/* Video Recording */}
          <div className="lg:col-span-1">
            <VideoRecorder
              sessionId={sessionId!}
              onRecordingStart={handleRecordingStart}
              onRecordingStop={handleRecordingStop}
            />
          </div>

          {/* Exam Content */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {currentSectionData.title}
                  <Badge className={getSectionTypeColor(currentSectionData.section_type)}>
                    {currentSectionData.questions.length} questions
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {currentSectionData.section_type === 'mcq' && "Select the best answer for each question."}
                  {currentSectionData.section_type === 'theoretical' && "Provide detailed written answers."}
                  {currentSectionData.section_type === 'practical' && "Write code to solve the given problems."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {currentSectionData.questions.map((question, index) => (
                  <Card key={question.id} className="border-l-4 border-l-primary">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">
                        Question {index + 1} ({question.points} point{question.points !== 1 ? 's' : ''})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-foreground">{question.question_text}</p>

                      {currentSectionData.section_type === 'mcq' && question.options && (
                        <RadioGroup
                          value={answers[question.id]?.selected_option || ""}
                          onValueChange={(value) => updateAnswer(question.id, "selected_option", value)}
                        >
                          {question.options.map((option, optionIndex) => (
                            <div key={optionIndex} className="flex items-center space-x-2">
                              <RadioGroupItem 
                                value={String.fromCharCode(65 + optionIndex)} 
                                id={`${question.id}-${optionIndex}`} 
                              />
                              <Label htmlFor={`${question.id}-${optionIndex}`} className="flex-1">
                                {String.fromCharCode(65 + optionIndex)}. {option}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      )}

                      {(currentSectionData.section_type === 'theoretical' || currentSectionData.section_type === 'practical') && (
                        <div className="space-y-2">
                          <Label htmlFor={`answer-${question.id}`}>
                            {currentSectionData.section_type === 'theoretical' ? 'Your Answer' : 'Your Code'}
                          </Label>
                          <Textarea
                            id={`answer-${question.id}`}
                            value={answers[question.id]?.answer_text || ""}
                            onChange={(e) => updateAnswer(question.id, "answer_text", e.target.value)}
                            placeholder={
                              currentSectionData.section_type === 'theoretical' 
                                ? "Type your answer here..." 
                                : "Write your code here..."
                            }
                            rows={currentSectionData.section_type === 'practical' ? 10 : 5}
                            className="font-mono"
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                <div className="flex justify-between pt-6">
                  <Button
                    variant="outline"
                    onClick={() => saveAnswers()}
                    className="flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    Save Progress
                  </Button>

                  <div className="flex gap-2">
                    {currentSection < sections.length - 1 ? (
                      <Button onClick={nextSection}>
                        Next Section
                      </Button>
                    ) : (
                      <Button onClick={() => setShowSubmitDialog(true)}>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Submit Exam
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Submit Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Exam</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to submit your exam? This action cannot be undone. 
              Make sure you have answered all questions to the best of your ability.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Review Answers</AlertDialogCancel>
            <AlertDialogAction onClick={submitExam} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Exam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CandidateExam;
