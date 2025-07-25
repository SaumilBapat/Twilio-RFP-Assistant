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
import { ArrowLeft, ArrowRight, Save, Settings, Zap, Brain, Target, Trash2, Upload, FileText, CheckCircle, Loader2, AlertCircle, Link, Plus, ExternalLink } from "lucide-react";
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
  const [newUrl, setNewUrl] = useState('');
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [isBulkUpload, setIsBulkUpload] = useState(false);
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkResults, setBulkResults] = useState<any>(null);
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

  const { data: referenceUrls = [], isLoading: urlsLoading } = useQuery<ReferenceUrl[]>({
    queryKey: ['/api/reference-urls'],
  });

  // Track processing progress for URLs being actively processed
  const [processingProgress, setProcessingProgress] = useState<Record<string, {processedChunks: number, totalChunks: number}>>({});

  // WebSocket connection for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user?.id || 'admin-user'}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.event === 'processing_progress') {
          const { url, processedChunks, totalChunks } = message.data;
          setProcessingProgress(prev => ({
            ...prev,
            [url]: { processedChunks, totalChunks }
          }));
        } else if (message.event === 'processing_status' && message.data.status === 'completed') {
          // Remove from processing when completed
          setProcessingProgress(prev => {
            const { [message.data.url]: removed, ...rest } = prev;
            return rest;
          });
          // Refresh URL list to show updated chunks
          queryClient.invalidateQueries({ queryKey: ['/api/reference-urls'] });
        }
      } catch (error) {
        console.error('WebSocket message parsing error:', error);
      }
    };

    return () => ws.close();
  }, [user?.id, queryClient]);

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

  const addUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch('/api/reference-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add URL');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reference-urls'] });
      setNewUrl('');
      setIsAddingUrl(false);
      toast({
        title: "URL Queued",
        description: "URL queued for background processing. You can continue working while it processes.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add URL. Please try again.",
        variant: "destructive",
      });
    },
  });

  const bulkUploadMutation = useMutation({
    mutationFn: async (urls: string[]) => {
      const response = await fetch('/api/reference-urls/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to process bulk URLs');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setBulkResults(data);
      setBulkUrls('');
      setIsBulkUpload(false);
      queryClient.invalidateQueries({ queryKey: ['/api/reference-urls'] });
      toast({
        title: "Bulk Upload Complete",
        description: `${data.summary.queued} URLs queued, ${data.summary.skipped} skipped, ${data.summary.invalid} invalid`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process bulk URLs",
        variant: "destructive",
      });
    },
  });

  const deleteUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const encodedUrl = encodeURIComponent(url);
      const response = await fetch(`/api/reference-urls/${encodedUrl}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete URL');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reference-urls'] });
      toast({
        title: "URL deleted",
        description: "The URL and its cached content have been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete URL. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Event handlers
  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    addUrlMutation.mutate(newUrl.trim());
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkUrls.trim()) return;
    
    // Parse URLs from textarea (split by newlines and filter empty lines)
    const urls = bulkUrls
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);
    
    if (urls.length === 0) return;
    
    bulkUploadMutation.mutate(urls);
  };

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

  const formatUrlDisplay = (url: string) => {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      const path = urlObj.pathname !== '/' ? urlObj.pathname : '';
      return domain + path;
    } catch {
      return url;
    }
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
                    Upload company documentation to enhance AI responses with specific context. Supports PDF, Word, CSV, TXT, and Excel files (.xlsx, .xlsm)
                  </CardDescription>
                </div>
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".pdf,.doc,.docx,.csv,.txt,.xlsx,.xlsm"
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

        {/* Reference Links */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Reference Links</CardTitle>
                  <CardDescription>
                    Manage cached URLs from Twilio ecosystem for enhanced AI responses
                  </CardDescription>
                </div>
                <div className="flex space-x-2">
                  <Button
                    onClick={() => {
                      setIsAddingUrl(!isAddingUrl);
                      setIsBulkUpload(false);
                    }}
                    variant="outline"
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add URL
                  </Button>
                  <Button
                    onClick={() => {
                      setIsBulkUpload(!isBulkUpload);
                      setIsAddingUrl(false);
                    }}
                    variant="outline"
                    size="sm"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Bulk Upload
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Add URL Form */}
              {isAddingUrl && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <form onSubmit={handleAddUrl} className="flex space-x-2">
                    <Input
                      type="url"
                      placeholder="https://twilio.com/docs/..."
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      className="flex-1"
                      disabled={addUrlMutation.isPending}
                    />
                    <Button 
                      type="submit" 
                      disabled={!newUrl.trim() || addUrlMutation.isPending}
                      size="sm"
                    >
                      {addUrlMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        'Add URL'
                      )}
                    </Button>
                    <Button 
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsAddingUrl(false);
                        setNewUrl('');
                      }}
                    >
                      Cancel
                    </Button>
                  </form>
                  <p className="text-xs text-gray-500 mt-2">
                    Only URLs from twilio.com, sendgrid.com, and segment.com are allowed
                  </p>
                </div>
              )}

              {/* Bulk Upload Form */}
              {isBulkUpload && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <form onSubmit={handleBulkUpload} className="space-y-3">
                    <div>
                      <Label htmlFor="bulkUrls">URLs (one per line)</Label>
                      <Textarea
                        id="bulkUrls"
                        placeholder="https://twilio.com/docs/..."
                        value={bulkUrls}
                        onChange={(e) => setBulkUrls(e.target.value)}
                        rows={6}
                        disabled={bulkUploadMutation.isPending}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        type="submit" 
                        disabled={!bulkUrls.trim() || bulkUploadMutation.isPending}
                        size="sm"
                      >
                        {bulkUploadMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          'Upload URLs'
                        )}
                      </Button>
                      <Button 
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsBulkUpload(false);
                          setBulkUrls('');
                          setBulkResults(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                  <p className="text-xs text-gray-500 mt-2">
                    Only URLs from twilio.com, sendgrid.com, and segment.com are allowed
                  </p>
                </div>
              )}

              {/* Bulk Upload Results */}
              {bulkResults && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Bulk Upload Results</h4>
                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-600">{bulkResults.summary.queued}</div>
                      <div className="text-xs text-green-700">Queued</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-yellow-600">{bulkResults.summary.skipped}</div>
                      <div className="text-xs text-yellow-700">Skipped</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-600">{bulkResults.summary.invalid}</div>
                      <div className="text-xs text-red-700">Invalid</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-gray-600">{bulkResults.summary.total}</div>
                      <div className="text-xs text-gray-700">Total</div>
                    </div>
                  </div>
                  <Button
                    onClick={() => setBulkResults(null)}
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Dismiss
                  </Button>
                </div>
              )}

              {/* URLs List */}
              {urlsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : referenceUrls.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Link className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No reference URLs cached yet</p>
                  <p className="text-sm mt-1">Add URLs from Twilio ecosystem domains</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {referenceUrls.map((urlData: ReferenceUrl) => (
                    <div
                      key={urlData.url}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center space-x-3 flex-1">
                        <ProcessingStatusIcon 
                          status={(() => {
                            const progress = processingProgress[urlData.url];
                            const isActivelyProcessing = !!progress;
                            const isCompleted = urlData.chunkCount > 0;
                            return isActivelyProcessing ? 'processing' : (isCompleted ? 'completed' : 'pending');
                          })()} 
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <a
                              href={urlData.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate"
                              title={urlData.url}
                            >
                              {formatUrlDisplay(urlData.url)}
                            </a>
                            <ExternalLink className="h-3 w-3 text-gray-400" />
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {(() => {
                              const progress = processingProgress[urlData.url];
                              const isActivelyProcessing = !!progress;
                              const isCompleted = urlData.chunkCount > 0;
                              
                              if (isActivelyProcessing) {
                                return `Processing ${progress.processedChunks} of ${progress.totalChunks} chunks...`;
                              } else if (isCompleted) {
                                return `✅ ${urlData.chunkCount} chunks processed • ${new Date(urlData.lastCached).toLocaleDateString()}`;
                              } else {
                                return "⏳ Queued for processing...";
                              }
                            })()}
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => deleteUrlMutation.mutate(urlData.url)}
                        disabled={deleteUrlMutation.isPending}
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
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