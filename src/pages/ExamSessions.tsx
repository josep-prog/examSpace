import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Eye, Clock, User, MapPin, AlertTriangle, CheckCircle } from "lucide-react";

interface ExamSession {
  id: string;
  full_name: string;
  email: string;
  contact: string;
  exam_location: string;
  custom_location: string | null;
  status: 'in_progress' | 'completed' | 'abandoned';
  started_at: string;
  submitted_at: string | null;
  flags: any;
  exam: {
    title: string;
    rotation_slot: number;
  };
}

const ExamSessions = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<any>(null);

  useEffect(() => {
    if (examId) {
      loadSessions();
    }
  }, [examId]);

  const loadSessions = async () => {
    try {
      // Load exam details
      const { data: examData, error: examError } = await supabase
        .from("exams")
        .select("*")
        .eq("id", examId)
        .single();

      if (examError) throw examError;
      setExam(examData);

      // Load sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("candidate_sessions")
        .select(`
          *,
          exam:exams(title, rotation_slot)
        `)
        .eq("exam_id", examId)
        .order("started_at", { ascending: false });

      if (sessionsError) throw sessionsError;
      setSessions(sessionsData || []);
    } catch (error) {
      console.error("Error loading sessions:", error);
      toast.error("Failed to load exam sessions");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'abandoned': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'in_progress': return <Clock className="h-4 w-4" />;
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'abandoned': return <AlertTriangle className="h-4 w-4" />;
      default: return null;
    }
  };

  const formatDuration = (startedAt: string, submittedAt?: string | null) => {
    const start = new Date(startedAt);
    const end = submittedAt ? new Date(submittedAt) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getLocationDisplay = (location: string, customLocation?: string | null) => {
    if (location === 'other' && customLocation) {
      return customLocation;
    }
    return location.charAt(0).toUpperCase() + location.slice(1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/manage-exams")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Exams
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Exam Sessions</h1>
              <p className="text-sm text-muted-foreground">{exam?.title}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {sessions.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <User className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No sessions found</h3>
              <p className="text-muted-foreground">
                No candidates have taken this exam yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <User className="h-8 w-8 text-primary" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-muted-foreground">Total Sessions</p>
                      <p className="text-2xl font-bold">{sessions.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Clock className="h-8 w-8 text-blue-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                      <p className="text-2xl font-bold">{sessions.filter(s => s.status === 'in_progress').length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-muted-foreground">Completed</p>
                      <p className="text-2xl font-bold">{sessions.filter(s => s.status === 'completed').length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <AlertTriangle className="h-8 w-8 text-red-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-muted-foreground">Abandoned</p>
                      <p className="text-2xl font-bold">{sessions.filter(s => s.status === 'abandoned').length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sessions Table */}
            <Card>
              <CardHeader>
                <CardTitle>Candidate Sessions</CardTitle>
                <CardDescription>
                  Monitor candidate exam sessions and review their progress
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Flags</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{session.full_name}</p>
                            <p className="text-sm text-muted-foreground">{session.email}</p>
                            <p className="text-sm text-muted-foreground">{session.contact}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getStatusColor(session.status)} flex items-center gap-1 w-fit`}>
                            {getStatusIcon(session.status)}
                            {session.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="h-4 w-4" />
                            {getLocationDisplay(session.exam_location, session.custom_location)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-mono">
                            {formatDuration(session.started_at, session.submitted_at)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{new Date(session.started_at).toLocaleDateString()}</p>
                            <p className="text-muted-foreground">
                              {new Date(session.started_at).toLocaleTimeString()}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {session.flags && Array.isArray(session.flags) && session.flags.length > 0 ? (
                            <Badge variant="destructive">
                              {session.flags.length} flag{session.flags.length !== 1 ? 's' : ''}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">No flags</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/admin/session/${session.id}/review`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default ExamSessions;

