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
import { ArrowLeft, ArrowRight, Save, Settings, Zap, Brain, Target, Trash2, Upload, FileText, CheckCircle, Loader2, AlertCircle, Link, Plus, ExternalLink, ChevronDown, ChevronRight, FolderOpen, Folder, File, Globe, X } from "lucide-react";
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

  // Document upload functionality
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadingFile(true);
    setUploadingCount(0);
    setTotalUploads(files.length);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/reference-documents', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'x-user-id': user?.id || 'admin-user'
          },
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        setUploadingCount(i + 1);
      } catch (error) {
        console.error('Upload error:', error);
        toast({
          title: 'Upload Failed',
          description: `Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: 'destructive'
        });
      }
    }

    setUploadingFile(false);
    setUploadingCount(0);
    setTotalUploads(0);
    
    // Refresh the documents list
    queryClient.invalidateQueries({ queryKey: ['/api/reference-documents'] });
    
    // Clear the file input
    if (event.target) {
      event.target.value = '';
    }

    toast({
      title: 'Upload Complete',
      description: `Successfully uploaded ${files.length} document(s)`
    });
  };

  // Document delete functionality
  const handleDeleteDocument = async (documentId: string) => {
    try {
      const response = await fetch(`/api/reference-documents/${documentId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'x-user-id': user?.id || 'admin-user'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      // Refresh the documents list
      queryClient.invalidateQueries({ queryKey: ['/api/reference-documents'] });
      
      toast({
        title: 'Document Deleted',
        description: 'Document has been removed successfully'
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive'
      });
    }
  };

  // URL delete functionality
  const handleDeleteUrl = async (url: string) => {
    try {
      const encodedUrl = encodeURIComponent(url);
      const response = await fetch(`/api/reference-urls/${encodedUrl}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'x-user-id': user?.id || 'admin-user'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete URL');
      }

      // Refresh the URLs list
      queryClient.invalidateQueries({ queryKey: ['/api/reference-urls'] });
      
      toast({
        title: 'URL Deleted',
        description: 'Reference URL has been removed successfully'
      });
    } catch (error) {
      console.error('Delete URL error:', error);
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete URL',
        variant: 'destructive'
      });
    }
  };

  // Single URL add functionality
  const handleAddUrl = async () => {
    if (!newUrl.trim()) return;

    setIsAddingUrl(true);
    try {
      const response = await fetch('/api/reference-urls', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || 'admin-user'
        },
        body: JSON.stringify({ url: newUrl.trim() })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add URL');
      }

      setNewUrl('');
      queryClient.invalidateQueries({ queryKey: ['/api/reference-urls'] });
      
      toast({
        title: 'URL Added',
        description: 'Reference URL has been queued for processing'
      });
    } catch (error) {
      console.error('Add URL error:', error);
      toast({
        title: 'Add Failed',
        description: error instanceof Error ? error.message : 'Failed to add URL',
        variant: 'destructive'
      });
    } finally {
      setIsAddingUrl(false);
    }
  };

  // Bulk URL add functionality
  const handleBulkAddUrls = async () => {
    if (!bulkUrls.trim()) return;

    const urls = bulkUrls.split('\n').filter(url => url.trim()).map(url => url.trim());
    if (urls.length === 0) return;

    setIsAddingUrl(true);
    try {
      const response = await fetch('/api/reference-urls/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || 'admin-user'
        },
        body: JSON.stringify({ urls })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to process bulk URLs');
      }

      const results = await response.json();
      setBulkResults(results);
      setBulkUrls('');
      
      queryClient.invalidateQueries({ queryKey: ['/api/reference-urls'] });
      
      toast({
        title: 'Bulk Processing Complete',
        description: `Processed ${urls.length} URLs. Check results below.`
      });
    } catch (error) {
      console.error('Bulk add URLs error:', error);
      toast({
        title: 'Bulk Processing Failed',
        description: error instanceof Error ? error.message : 'Failed to process bulk URLs',
        variant: 'destructive'
      });
    } finally {
      setIsAddingUrl(false);
    }
  };

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['/api/pipelines/default'],
    queryFn: () => fetch('/api/pipelines/default', {
      credentials: 'include',
      headers: { 'x-user-id': user?.id || 'user-1' }
    }).then(res => res.json()),
  });

  const { data: referenceDocuments = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['/api/reference-documents'],
    queryFn: () => fetch('/api/reference-documents', {
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
                  {/* Upload Area */}
                  <div className="mb-4">
                    <div 
                      className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">Click to upload reference documents</p>
                      <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, CSV, TXT files supported (up to 50MB)</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xlsx,.xlsm,.csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  {/* Upload Progress */}
                  {uploadingFile && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Uploading documents...</span>
                        <span className="text-sm text-gray-600">{uploadingCount}/{totalUploads}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${totalUploads > 0 ? (uploadingCount / totalUploads) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Documents List */}
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
                        <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <FileText className="h-5 w-5 text-blue-600" />
                            <div>
                              <p className="text-sm font-medium">{doc.fileName}</p>
                              <p className="text-xs text-gray-500">{doc.fileType}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
                  {/* Bulk URL Upload Section */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant={!isBulkUpload ? "default" : "outline"}
                          size="sm"
                          onClick={() => setIsBulkUpload(false)}
                        >
                          Single URL
                        </Button>
                        <Button
                          variant={isBulkUpload ? "default" : "outline"}
                          size="sm"
                          onClick={() => setIsBulkUpload(true)}
                        >
                          Bulk URLs
                        </Button>
                      </div>
                    </div>

                    {!isBulkUpload ? (
                      /* Single URL Input */
                      <div className="flex space-x-2">
                        <Input
                          placeholder="Enter Twilio ecosystem URL to cache..."
                          value={newUrl}
                          onChange={(e) => setNewUrl(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && !isAddingUrl && handleAddUrl()}
                        />
                        <Button 
                          onClick={handleAddUrl}
                          disabled={!newUrl.trim() || isAddingUrl}
                          size="sm"
                        >
                          {isAddingUrl ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      /* Bulk URL Input */
                      <div className="space-y-3">
                        <Textarea
                          placeholder="Enter multiple URLs (one per line)&#10;https://www.twilio.com/docs/...&#10;https://sendgrid.com/docs/...&#10;https://segment.com/docs/..."
                          value={bulkUrls}
                          onChange={(e) => setBulkUrls(e.target.value)}
                          rows={6}
                          className="resize-none"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            {bulkUrls.split('\n').filter(url => url.trim()).length} URLs to process
                          </span>
                          <Button 
                            onClick={handleBulkAddUrls}
                            disabled={!bulkUrls.trim() || isAddingUrl}
                            size="sm"
                          >
                            {isAddingUrl ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Plus className="h-4 w-4 mr-2" />
                            )}
                            Process URLs
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Bulk Results Display */}
                    {bulkResults && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                        <h4 className="font-medium text-sm mb-2">Bulk Upload Results:</h4>
                        <div className="text-sm space-y-1">
                          <p className="text-green-600">✓ {bulkResults.queued} URLs queued for processing</p>
                          <p className="text-yellow-600">⚠ {bulkResults.skipped} URLs already cached</p>
                          <p className="text-red-600">✗ {bulkResults.invalid} URLs invalid/rejected</p>
                        </div>
                        {bulkResults.results && bulkResults.results.length > 0 && (
                          <div className="mt-3 max-h-32 overflow-y-auto space-y-1">
                            {bulkResults.results.map((result: any, index: number) => (
                              <div key={index} className={`text-xs px-2 py-1 rounded ${
                                result.status === 'queued' ? 'bg-green-100 text-green-700' :
                                result.status === 'skipped' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                <span className="font-mono">{result.url}</span>
                                {result.message && <span className="ml-2">- {result.message}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setBulkResults(null)}
                          className="mt-2"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Clear Results
                        </Button>
                      </div>
                    )}
                  </div>

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
                        <div key={urlData.url} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <Link className="h-5 w-5 text-green-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{urlData.url}</p>
                              <p className="text-xs text-gray-500">{urlData.chunkCount} chunks • Last cached: {new Date(urlData.lastCached).toLocaleDateString()}</p>
                            </div>
                            <a 
                              href={urlData.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUrl(urlData.url)}
                            className="text-red-600 hover:text-red-700 flex-shrink-0 ml-2"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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