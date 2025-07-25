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
import { ArrowLeft, ArrowRight, Save, Settings, Zap, Brain, Target, Trash2, Upload, FileText, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { authService } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

export default function PipelineEditor() {
  const [, setLocation] = useLocation();
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [editedStep, setEditedStep] = useState<PipelineStep | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
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

  const { data: referenceDocuments = [], isLoading: documentsLoading } = useQuery<ReferenceDocument[]>({
    queryKey: ['/api/reference-documents'],
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/reference-documents', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload document');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/reference-documents'] });
      setUploadingFile(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
      setUploadingFile(false);
    }
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (documentId: string) => 
      apiRequest('DELETE', `/api/reference-documents/${documentId}`),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/reference-documents'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    }
  });

  const updatePipelineMutation = useMutation({
    mutationFn: (updatedPipeline: Pipeline) => 
      apiRequest('PUT', `/api/pipelines/${updatedPipeline.id}`, updatedPipeline),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Pipeline updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pipelines/default'] });
      setEditingStep(null);
      setEditedStep(null);
    },
    onError: () => {
      toast({
        title: "Error", 
        description: "Failed to update pipeline",
        variant: "destructive",
      });
    }
  });

  const clearCacheMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', '/api/cache/clear');
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Cache Cleared",
        description: `Deleted ${data.deletedReferences} reference entries and ${data.deletedResponses} response entries`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear cache",
        variant: "destructive",
      });
    }
  });

  const startEdit = (stepIndex: number) => {
    if (pipeline) {
      setEditingStep(stepIndex);
      setEditedStep({ ...pipeline.steps[stepIndex] });
    }
  };

  const getLockedModel = (stepIndex: number, stepName: string) => {
    if (stepName === "Reference Research") {
      return "gpt-4o"; // Step 1: GPT-4o with search
    } else if (stepName === "Generic Draft Generation" || stepName === "Tailored RFP Response") {
      return "o3"; // Steps 2&3: o3
    }
    return pipeline?.steps[stepIndex]?.model || "gpt-4o";
  };

  const shouldShowTemperature = (stepName: string) => {
    // Temperature not supported on o3 models
    return stepName === "Reference Research";
  };

  const cancelEdit = () => {
    setEditingStep(null);
    setEditedStep(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadingFile(true);
      uploadDocumentMutation.mutate(file);
    }
    // Reset input value to allow re-selecting the same file
    event.target.value = '';
  };

  const getCachingStatusIcon = (status: ReferenceDocument['cachingStatus']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getFileTypeIcon = (fileType: string) => {
    return <FileText className="h-4 w-4 text-gray-600" />;
  };

  const saveStep = () => {
    if (pipeline && editedStep && editingStep !== null) {
      const updatedSteps = [...pipeline.steps];
      // Ensure model is locked to correct value
      const stepName = pipeline.steps[editingStep].name;
      const lockedModel = getLockedModel(editingStep, stepName);
      
      updatedSteps[editingStep] = {
        ...editedStep,
        model: lockedModel
      };
      
      updatePipelineMutation.mutate({
        ...pipeline,
        steps: updatedSteps
      });
    }
  };

  const getStepIcon = (stepName: string) => {
    switch (stepName) {
      case "Reference Research":
        return <Zap className="h-5 w-5 text-blue-600" />;
      case "Generic Draft Generation":
        return <Brain className="h-5 w-5 text-purple-600" />;
      case "Tailored RFP Response":
        return <Target className="h-5 w-5 text-green-600" />;
      default:
        return <Settings className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStepColor = (stepName: string) => {
    switch (stepName) {
      case "Reference Research":
        return "border-blue-200 bg-blue-50";
      case "Generic Draft Generation":
        return "border-purple-200 bg-purple-50";
      case "Tailored RFP Response":
        return "border-green-200 bg-green-50";
      default:
        return "border-gray-200 bg-gray-50";
    }
  };

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
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Cache
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear AI Cache</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all cached AI responses and references from the database. 
                  This action cannot be undone and will force the system to regenerate all responses 
                  from scratch on the next processing jobs.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => clearCacheMutation.mutate()}
                  disabled={clearCacheMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {clearCacheMutation.isPending ? "Clearing..." : "Clear Cache"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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

        {/* Reference Documents */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Reference Documents</CardTitle>
                  <CardDescription>
                    Upload company documentation to enhance AI responses with specific context
                  </CardDescription>
                </div>
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".pdf,.doc,.docx,.csv,.txt"
                    className="hidden"
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile || uploadDocumentMutation.isPending}
                    variant="outline"
                    size="sm"
                  >
                    {uploadingFile || uploadDocumentMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Document
                      </>
                    )}
                  </Button>
                </div>
              </div>
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
                  <p className="text-sm mt-1">Upload PDF, Word documents, CSV, or text files</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {referenceDocuments.map((doc: ReferenceDocument) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center space-x-3 flex-1">
                        {getFileTypeIcon(doc.fileType)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {doc.fileName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(doc.fileSize / 1024 / 1024).toFixed(2)} MB • {doc.totalChunks} chunks
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {getCachingStatusIcon(doc.cachingStatus)}
                          <span className="text-xs text-gray-600">
                            {doc.cachingStatus === 'completed' 
                              ? 'Cached' 
                              : doc.cachingStatus === 'processing'
                              ? 'Processing...'
                              : doc.cachingStatus === 'error'
                              ? 'Error'
                              : 'Pending'}
                          </span>
                        </div>
                      </div>
                      <Button
                        onClick={() => deleteDocumentMutation.mutate(doc.id)}
                        disabled={deleteDocumentMutation.isPending}
                        variant="ghost"
                        size="sm"
                        className="ml-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Steps Flow */}
        <div className="space-y-6">
          {pipeline.steps.map((step: PipelineStep, index: number) => (
            <div key={index} className="relative">
              <Card className={`${getStepColor(step.name)} border-2`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        <div className="bg-white rounded-full p-2 shadow-sm">
                          {getStepIcon(step.name)}
                        </div>
                        <div>
                          <CardTitle className="text-lg">Step {index + 1}: {step.name}</CardTitle>
                          <div className="flex items-center space-x-4 mt-1">
                            <Badge variant="outline" className="text-xs">
                              Model: {getLockedModel(index, step.name)}
                            </Badge>
                            {shouldShowTemperature(step.name) && (
                              <Badge variant="outline" className="text-xs">
                                Temp: {step.temperature}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-xs">
                              Max Tokens: {step.maxTokens}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => startEdit(index)}
                      disabled={editingStep !== null}
                      variant="outline"
                      size="sm"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Edit Prompts
                    </Button>
                  </div>
                </CardHeader>
                
                {editingStep === index && editedStep ? (
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="model">AI Model</Label>
                        <Input
                          id="model"
                          value={getLockedModel(index, step.name)}
                          disabled={true}
                          className="bg-gray-100"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {step.name === "Reference Research" 
                            ? "Locked to GPT-4o with search capabilities" 
                            : "Locked to o3 model for advanced reasoning"}
                        </p>
                      </div>
                      {shouldShowTemperature(step.name) && (
                        <div>
                          <Label htmlFor="temperature">Temperature</Label>
                          <Input
                            id="temperature"
                            type="number"
                            min="0"
                            max="1"
                            step="0.1"
                            value={editedStep.temperature}
                            onChange={(e) => setEditedStep({...editedStep, temperature: parseFloat(e.target.value)})}
                          />
                        </div>
                      )}
                      <div>
                        <Label htmlFor="maxTokens">Max Tokens</Label>
                        <Input
                          id="maxTokens"
                          type="number"
                          value={editedStep.maxTokens}
                          onChange={(e) => setEditedStep({...editedStep, maxTokens: parseInt(e.target.value)})}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="systemPrompt">System Prompt</Label>
                      <Textarea
                        id="systemPrompt"
                        rows={4}
                        value={editedStep.systemPrompt}
                        onChange={(e) => setEditedStep({...editedStep, systemPrompt: e.target.value})}
                        placeholder="Define the AI's role and behavior..."
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="userPrompt">User Prompt</Label>
                      <Textarea
                        id="userPrompt"
                        rows={6}
                        value={editedStep.userPrompt}
                        onChange={(e) => setEditedStep({...editedStep, userPrompt: e.target.value})}
                        placeholder="Specify the task and requirements..."
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Available placeholders: {"{FIRST_COLUMN}"}, {"{RFP_INSTRUCTIONS}"}, {"{ADDITIONAL_DOCUMENTS}"}, {"{Reference Research}"}, {"{Generic Draft Generation}"}
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <Button 
                        onClick={saveStep}
                        disabled={updatePipelineMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </Button>
                      <Button 
                        onClick={cancelEdit}
                        variant="outline"
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                ) : (
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">System Prompt</h4>
                        <div className="bg-white rounded-lg p-3 text-sm text-gray-700 border">
                          {step.systemPrompt.length > 200 
                            ? `${step.systemPrompt.substring(0, 200)}...` 
                            : step.systemPrompt}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">User Prompt</h4>
                        <div className="bg-white rounded-lg p-3 text-sm text-gray-700 border">
                          {step.userPrompt.length > 300 
                            ? `${step.userPrompt.substring(0, 300)}...` 
                            : step.userPrompt}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
              
              {/* Arrow to next step */}
              {index < pipeline.steps.length - 1 && (
                <div className="flex justify-center my-4">
                  <div className="bg-white rounded-full p-2 shadow-sm border">
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}