import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, ArrowRight, Save, Settings, Zap, Brain, Target, Trash2, Upload, FileText, CheckCircle, Loader2, AlertCircle, Link, Plus, ExternalLink, ChevronDown, ChevronRight, FolderOpen, Folder, File, Globe } from "lucide-react";
import { authService } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ProcessingStatusIcon, formatPayloadSize } from "@/components/ProcessingStatusIcon";

interface PipelineStep {
  name: string;
  model: string;
  tools: string[];
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
}

interface Pipeline {
  id: string;
  name: string;
  steps: PipelineStep[];
}

interface ReferenceDocument {
  id: string;
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash: string;
  cachingStatus: 'pending' | 'processing' | 'completed' | 'error';
  totalChunks: number;
  createdAt: string;
  updatedAt: string;
}

interface ReferenceUrl {
  url: string;
  chunkCount: number;
  lastCached: string;
}

export default function PipelineEditor() {
  const [, setLocation] = useLocation();
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [editedStep, setEditedStep] = useState<PipelineStep | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [totalUploads, setTotalUploads] = useState(0);
  const [newUrl, setNewUrl] = useState('');
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [isBulkUpload, setIsBulkUpload] = useState(false);
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkResults, setBulkResults] = useState<any>(null);
  const [referencesOpen, setReferencesOpen] = useState(true);
  const [pipelineStepsOpen, setPipelineStepsOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const user = authService.getCurrentUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['/api/pipelines/default'],
    queryFn: () => fetch('/api/pipelines/default', {
      credentials: 'include',
      headers: { 'x-user-id': user?.id || 'user-1' }
    }).then(res => res.json()),
  });

  const { data: referenceDocuments = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['/api/documents'],
    queryFn: () => fetch('/api/documents', {
      credentials: 'include',
      headers: { 'x-user-id': user?.id || 'user-1' }
    }).then(res => res.json()),
  });

  const { data: referenceUrls = [], isLoading: urlsLoading } = useQuery({
    queryKey: ['/api/reference-urls'],
    queryFn: () => fetch('/api/reference-urls', {
      credentials: 'include',
      headers: { 'x-user-id': user?.id || 'user-1' }
    }).then(res => res.json()),
  });

  const { data: processingProgress = {} } = useQuery({
    queryKey: ['/api/processing-progress'],
    queryFn: () => fetch('/api/processing-progress', {
      credentials: 'include',
      headers: { 'x-user-id': user?.id || 'user-1' }
    }).then(res => res.json()),
    refetchInterval: 2000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Pipeline not found</h2>
          <Button onClick={() => setLocation('/dashboard')} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setLocation('/dashboard')}
              className="text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Pipeline Editor</h1>
              <p className="text-gray-600 mt-1">Configure the AI processing steps for RFP responses</p>
            </div>
          </div>
        </div>

        {/* Pipeline Overview */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5" />
                <span>{pipeline.name}</span>
              </CardTitle>
              <CardDescription>
                This pipeline processes RFP questions through {pipeline.steps.length} AI-powered steps
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* References Section */}
        <div className="mb-8">
          <Collapsible open={referencesOpen} onOpenChange={setReferencesOpen}>
            <CollapsibleTrigger asChild>
              <Card className="cursor-pointer hover:bg-gray-50 transition-colors">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        {referencesOpen ? (
                          <ChevronDown className="h-5 w-5 text-gray-600" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-600" />
                        )}
                        <FileText className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <CardTitle>References</CardTitle>
                        <CardDescription>
                          Documents and URLs for enhanced AI responses
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">
                        {referenceDocuments.length} docs
                      </Badge>
                      <Badge variant="outline">
                        {referenceUrls.length} URLs
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-6 mt-4">
              {/* Reference Documents */}
              <Card>
                <CardHeader>
                  <CardTitle>Reference Documents</CardTitle>
                  <CardDescription>
                    Upload company documentation to enhance AI responses
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {documentsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : referenceDocuments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p>No reference documents uploaded yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {referenceDocuments.map((doc: ReferenceDocument) => (
                        <div key={doc.id} className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm font-medium">{doc.fileName}</p>
                          <p className="text-xs text-gray-500">{doc.fileType}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Reference Links */}
              <Card>
                <CardHeader>
                  <CardTitle>Reference Links</CardTitle>
                  <CardDescription>
                    Manage cached URLs from Twilio ecosystem
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {urlsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : referenceUrls.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Link className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p>No reference URLs cached yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {referenceUrls.map((urlData: ReferenceUrl) => (
                        <div key={urlData.url} className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm font-medium truncate">{urlData.url}</p>
                          <p className="text-xs text-gray-500">{urlData.chunkCount} chunks</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* AI Pipeline Steps Section */}
        <div className="mb-8">
          <Collapsible open={pipelineStepsOpen} onOpenChange={setPipelineStepsOpen}>
            <CollapsibleTrigger asChild>
              <Card className="cursor-pointer hover:bg-gray-50 transition-colors">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        {pipelineStepsOpen ? (
                          <ChevronDown className="h-5 w-5 text-gray-600" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-600" />
                        )}
                        <Settings className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <CardTitle>AI Pipeline Steps</CardTitle>
                        <CardDescription>
                          Configure the {pipeline.steps.length}-step AI processing workflow
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">
                        {pipeline.steps.length} steps
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-6 mt-4">
              {pipeline.steps.map((step: PipelineStep, index: number) => (
                <Card key={index}>
                  <CardHeader>
                    <CardTitle>Step {index + 1}: {step.name}</CardTitle>
                    <CardDescription>
                      Model: {step.model} • Max Tokens: {step.maxTokens}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-gray-600">
                      <p><strong>System:</strong> {step.systemPrompt.substring(0, 100)}...</p>
                      <p className="mt-2"><strong>User:</strong> {step.userPrompt.substring(0, 100)}...</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}