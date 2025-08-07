import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Filter, Search, Download, Edit, ExternalLink, Play, Pause, RotateCcw, RefreshCw, MessageSquare, Repeat } from "lucide-react";
import { StepInspectionPanel } from "@/components/step-inspection-panel";
import { authService } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface CsvRow {
  id: string;
  rowIndex: number;
  originalData: Record<string, any>;
  enrichedData?: Record<string, any>;
  fullContextualQuestion?: string;
  feedback?: string;
  needsReprocessing?: boolean;
  reprocessedAt?: string;
}

interface Job {
  id: string;
  name: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
}

interface ProcessingLog {
  step: string;
  log: string;
  timestamp: Date;
}

export default function Spreadsheet() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const [processingLogs, setProcessingLogs] = useState<ProcessingLog[]>([]);
  const [currentProcessingRow, setCurrentProcessingRow] = useState<number | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [selectedRowForFeedback, setSelectedRowForFeedback] = useState<CsvRow | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [bulkFeedbackDialogOpen, setBulkFeedbackDialogOpen] = useState(false);
  const [bulkFeedbackText, setBulkFeedbackText] = useState('');
  const user = authService.getCurrentUser();
  const jobId = params.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: job, isLoading: jobLoading, error: jobError } = useQuery({
    queryKey: ['/api/jobs', jobId],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}`, {
        credentials: 'include',
        headers: { 'x-user-id': user?.id || 'user-1' }
      });
      if (!res.ok) {
        throw new Error('Job not found');
      }
      return res.json();
    },
    enabled: !!jobId
  });

  const { data: csvData = [], isLoading: dataLoading, error: dataError } = useQuery({
    queryKey: ['/api/jobs', jobId, 'csv-data'],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/csv-data`, {
        credentials: 'include',
        headers: { 'x-user-id': user?.id || 'user-1' }
      });
      if (!res.ok) {
        throw new Error('CSV data not found');
      }
      return res.json();
    },
    enabled: !!jobId && !!job,
    refetchInterval: job?.status === 'in_progress' ? 2000 : false, // Poll every 2 seconds when job is in progress
  });

  // WebSocket connection for real-time updates
  const { lastMessage } = useWebSocket(user?.id || '');

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;
    
    const { event, data } = lastMessage;
    if (data?.jobId === jobId) {
      console.log('🔄 [Spreadsheet] Processing WebSocket message:', lastMessage);
      switch (event) {
        case 'jobStarted':
        case 'jobPaused':
        case 'jobCompleted':
        case 'jobError':
          // Refetch job data
          console.log(`🔄 [Spreadsheet] Received ${event} event for job ${jobId}`);
          queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
          queryClient.refetchQueries({ queryKey: ['/api/jobs', jobId] });
          
          // Force update the refetch interval for jobCompleted event
          if (event === 'jobCompleted') {
            console.log('✅ [Spreadsheet] Job completed, stopping polling');
          }
          break;
        case 'rowProcessed':
          // Refetch both job and CSV data for progress updates
          console.log('🔄 [Spreadsheet] Invalidating CSV data queries');
          queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
          queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId, 'csv-data'] });
          
          toast({
            title: "Processing Update",
            description: `Row ${data.rowIndex + 1} processed (${data.progress}% complete)`,
          });
          
          // Clear processing logs when row completes
          setProcessingLogs([]);
          setCurrentProcessingRow(null);
          break;
        case 'processing_log':
          // Handle detailed processing logs
          if (data.step && data.log) {
            const newLog: ProcessingLog = {
              step: data.step,
              log: data.log,
              timestamp: new Date()
            };
            setProcessingLogs(prev => [...prev.slice(-9), newLog]); // Keep last 10 logs
          }
          break;
      }
    }
  }, [lastMessage, jobId, queryClient, toast]);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      completed: { variant: "default" as const, className: "bg-success-100 text-success-800", label: "Completed" },
      in_progress: { variant: "default" as const, className: "bg-primary-100 text-primary-800", label: "In Progress" },
      paused: { variant: "default" as const, className: "bg-warning-100 text-warning-800", label: "Paused" },
      not_started: { variant: "secondary" as const, className: "", label: "Not Started" },
      error: { variant: "destructive" as const, className: "", label: "Error" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.not_started;
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const handleStepInspection = (rowIndex: number) => {
    setSelectedRowIndex(rowIndex);
    setInspectionOpen(true);
  };

  const toggleCellExpansion = (rowId: string, column: string) => {
    const cellKey = `${rowId}-${column}`;
    const newExpanded = new Set(expandedCells);
    if (newExpanded.has(cellKey)) {
      newExpanded.delete(cellKey);
    } else {
      newExpanded.add(cellKey);
    }
    setExpandedCells(newExpanded);
  };

  const isCellExpanded = (rowId: string, column: string) => {
    return expandedCells.has(`${rowId}-${column}`);
  };

  const handleJobAction = async (action: string) => {
    if (!jobId) return;
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || 'user-1'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Handle different action past tense forms correctly
      const actionPastTense = {
        'pause': 'paused',
        'resume': 'resumed', 
        'start': 'started',
        'reset': 'reset',
        'cancel': 'cancelled',
        'reprocess': 'reprocessed'
      }[action] || `${action}ed`;
      
      toast({
        title: "Success",
        description: `Job ${actionPastTense} successfully`,
      });
      // Refetch job data to update status
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} job`,
        variant: "destructive",
      });
    }
  };

  const handleExport = async () => {
    if (!jobId) return;
    
    try {
      const response = await fetch(`/api/jobs/${jobId}/export`, {
        credentials: 'include',
        headers: { 'x-user-id': user?.id || 'user-1' }
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${job?.fileName || 'export'}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleFeedbackOpen = (row: CsvRow) => {
    setSelectedRowForFeedback(row);
    setFeedbackText(row.feedback || '');
    setFeedbackDialogOpen(true);
  };

  const handleFeedbackSave = async (feedbackValue?: string) => {
    if (!selectedRowForFeedback || !jobId) return;

    const feedback = feedbackValue !== undefined ? feedbackValue : feedbackText;

    try {
      const response = await fetch(`/api/jobs/${jobId}/rows/${selectedRowForFeedback.rowIndex}/feedback`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || 'user-1'
        },
        credentials: 'include',
        body: JSON.stringify({ feedback })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      toast({
        title: "Success",
        description: "Feedback saved successfully",
      });

      // Refresh data to show updated feedback
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId, 'csv-data'] });
      setFeedbackDialogOpen(false);
      setSelectedRowForFeedback(null);
      setFeedbackText('');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save feedback",
        variant: "destructive",
      });
    }
  };

  const handleFeedbackReprocessing = async () => {
    if (!jobId) return;

    try {
      const response = await fetch(`/api/jobs/${jobId}/reprocess-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || 'user-1'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      toast({
        title: "Success",
        description: `Feedback reprocessing started for ${result.rowsToReprocess || 'selected'} rows`,
      });

      // Refresh job data to update status
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start feedback reprocessing",
        variant: "destructive",
      });
    }
  };

  const handleBulkFeedbackSave = async () => {
    if (!jobId || !bulkFeedbackText.trim()) return;

    try {
      const response = await fetch(`/api/jobs/${jobId}/bulk-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || 'user-1'
        },
        credentials: 'include',
        body: JSON.stringify({ feedback: bulkFeedbackText })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      toast({
        title: "Success",
        description: `Applied feedback to ${result.rowsUpdated} rows. Starting reprocessing...`,
      });

      setBulkFeedbackDialogOpen(false);
      setBulkFeedbackText('');

      // Start reprocessing automatically
      setTimeout(() => {
        handleFeedbackReprocessing();
      }, 1000);

      // Refresh CSV data to show updated feedback
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId, 'csv-data'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to apply bulk feedback",
        variant: "destructive",
      });
    }
  };

  const getAllColumns = () => {
    if (!csvData || csvData.length === 0) return [];
    
    const firstRow = csvData[0];
    if (!firstRow || !firstRow.originalData) return [];
    
    // Columns to exclude from the display (keep FULL_CONTEXTUAL_QUESTION visible)
    const excludedColumns = ["RFP_INSTRUCTIONS", "ADDITIONAL_DOCUMENTS", "jobId"];
    
    const originalColumns = Object.keys(firstRow.originalData || {}).filter(
      key => !excludedColumns.includes(key)
    );
    const enrichedColumns = Object.keys(firstRow.enrichedData || {}).filter(
      key => !originalColumns.includes(key) && !excludedColumns.includes(key)
    );
    
    // Extract the original question column and FULL_CONTEXTUAL_QUESTION
    const questionColumn = originalColumns.find(col => col !== 'FULL_CONTEXTUAL_QUESTION');
    const contextualQuestionColumn = originalColumns.includes('FULL_CONTEXTUAL_QUESTION') ? 'FULL_CONTEXTUAL_QUESTION' : null;
    const otherOriginalColumns = originalColumns.filter(col => col !== questionColumn && col !== 'FULL_CONTEXTUAL_QUESTION');
    
    // Ensure pipeline steps appear in correct order
    const pipelineOrder = ["Reference Research", "Generic Draft Generation", "Tailored RFP Response"];
    const orderedEnrichedColumns = pipelineOrder.filter(col => enrichedColumns.includes(col));
    const otherEnrichedColumns = enrichedColumns.filter(col => !pipelineOrder.includes(col));
    
    // Build final column order: Question → Full Contextual Question → Other Original → Pipeline Steps → Other Enriched
    const result = [];
    if (questionColumn) result.push(questionColumn);
    if (contextualQuestionColumn) result.push(contextualQuestionColumn);
    result.push(...otherOriginalColumns, ...orderedEnrichedColumns, ...otherEnrichedColumns);
    
    // Always add feedback column for user interaction
    result.push('Feedback');
    
    return result;
  };

  const columns = getAllColumns();

  if (jobLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // Handle errors first
  if (jobError || dataError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">
            {jobError ? 'Job not found' : 'Unable to load data'}
          </h2>
          <p className="text-gray-600 mt-2">
            {jobError ? 'This job may have been deleted or does not exist.' : 'There was an error loading the job data.'}
          </p>
          <Button onClick={() => setLocation('/dashboard')} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Job not found</h2>
          <Button onClick={() => setLocation('/dashboard')} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="h-full flex flex-col">
        {/* Spreadsheet Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
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
                <h2 className="text-xl font-semibold text-gray-900">{job.fileName}</h2>
                <div className="flex items-center space-x-4 mt-1">
                  {getStatusBadge(job.status)}
                  <span className="text-sm text-gray-500">
                    {job.processedRows} of {job.totalRows} rows processed
                  </span>
                  {/* DEBUG: Show exact status value */}
                  <span className="text-xs bg-yellow-100 px-2 py-1 rounded border">
                    Status: "{job.status}" (type: {typeof job.status})
                  </span>
                  {job.status === 'in_progress' && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      Processing row {job.processedRows + 1}...
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* Job Control Buttons */}
              {job.status === 'not_started' && (
                <Button
                  onClick={() => handleJobAction('start')}
                  className="bg-success-600 hover:bg-success-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Processing
                </Button>
              )}
              {job.status === 'in_progress' && (
                <>
                  <Button
                    onClick={() => handleJobAction('pause')}
                    variant="outline"
                    className="text-warning-600 border-warning-600 hover:bg-warning-50"
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </Button>
                  <Button
                    onClick={() => handleJobAction('reset')}
                    variant="outline"
                    className="text-orange-600 border-orange-600 hover:bg-orange-50"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                </>
              )}
              {job.status === 'paused' && (
                <>
                  <Button
                    onClick={() => handleJobAction('resume')}
                    className="bg-success-600 hover:bg-success-700"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </Button>
                  <Button
                    onClick={() => handleJobAction('reset')}
                    variant="outline"
                    className="text-orange-600 border-orange-600 hover:bg-orange-50"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                </>
              )}
              
              {job.status === 'error' && (
                <>
                  <Button
                    onClick={() => handleJobAction('resume')}
                    className="bg-success-600 hover:bg-success-700"
                    data-testid="button-retry-processing"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Retry Processing
                  </Button>
                  <Button
                    onClick={() => handleJobAction('reset')}
                    variant="outline"
                    className="text-orange-600 border-orange-600 hover:bg-orange-50"
                    data-testid="button-reset-job"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Job
                  </Button>
                </>
              )}
              
              {job.status === 'completed' && (
                <>
                  {csvData.some((row: CsvRow) => row.feedback) ? (
                    <Button
                      onClick={handleFeedbackReprocessing}
                      variant="outline"
                      className="bg-purple-50 text-purple-600 border-purple-600 hover:bg-purple-100"
                    >
                      <Repeat className="h-4 w-4 mr-2" />
                      Reprocess with Feedback ({csvData.filter((row: CsvRow) => row.feedback).length} rows)
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleJobAction('reprocess')}
                      variant="outline"
                      className="text-blue-600 border-blue-600 hover:bg-blue-50"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reprocess All
                    </Button>
                  )}
                  <Button
                    onClick={() => setBulkFeedbackDialogOpen(true)}
                    variant="outline"
                    className="text-indigo-600 border-indigo-600 hover:bg-indigo-50"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Add Feedback to All
                  </Button>
                </>
              )}
              
              <Button 
                variant="outline" 
                onClick={handleExport}
                className="text-gray-600 border-gray-300"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Progress Bar for In-Progress Jobs */}
        {job.status === 'in_progress' && (
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Processing Progress</span>
              <span>{job.processedRows} / {job.totalRows} rows ({Math.round((job.processedRows / job.totalRows) * 100)}%)</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-primary-500 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.round((job.processedRows / job.totalRows) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Real-time Processing Logs */}
        {job.status === 'in_progress' && processingLogs.length > 0 && (
          <div className="bg-slate-900 border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-100">Processing Details</h3>
              <span className="text-xs text-slate-400">
                Row {job.processedRows + 1} of {job.totalRows}
              </span>
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {processingLogs.map((log, index) => (
                <div key={index} className="flex items-start space-x-3 text-sm">
                  <div className="flex-shrink-0">
                    <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-300 font-medium">{log.step}:</span>
                      <span className="text-slate-100">{log.log}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {log.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Table Controls */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search rows..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>
            <div className="text-sm text-gray-500">
              {csvData.length} rows • {columns.length} columns
            </div>
          </div>
        </div>

        {/* Spreadsheet Grid */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full bg-white overflow-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="border border-gray-300 px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-12">
                    #
                  </th>
                  {columns.map((column) => (
                    <th 
                      key={column}
                      className={`border border-gray-300 px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase ${
                        column === 'Reference Research' ? 'w-80' : 
                        column === 'Feedback' ? 'w-64' : 'min-w-48'
                      }`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {csvData.map((row: CsvRow, index: number) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2 text-sm text-gray-900">
                      {row.rowIndex + 1}
                    </td>
                    {columns.map((column) => {
                      const rawValue = (row.enrichedData?.[column] || row.originalData?.[column]) || '';
                      const isAiGenerated = row.enrichedData && row.enrichedData[column];
                      
                      // Handle different value types - some might be objects with content/fileName
                      const getDisplayValue = (val: any, columnName: string): string | JSX.Element => {
                        // Special handling for Reference Research column
                        if (columnName === 'Reference Research' && val) {
                          let urls: string[] = [];
                          
                          // Handle different data formats
                          if (typeof val === 'string') {
                            try {
                              // Try to parse as JSON first
                              const parsed = JSON.parse(val);
                              if (Array.isArray(parsed)) {
                                urls = parsed;
                              } else {
                                // If it's a string that looks like an array, try to extract URLs
                                const urlMatches = val.match(/https?:\/\/[^\s",\]]+/g);
                                if (urlMatches) {
                                  urls = urlMatches;
                                } else {
                                  return val; // Return as-is if no URLs found
                                }
                              }
                            } catch {
                              // If parsing fails, try to extract URLs from the string
                              const urlMatches = val.match(/https?:\/\/[^\s",\]]+/g);
                              if (urlMatches) {
                                urls = urlMatches;
                              } else {
                                return val; // Return as-is if no URLs found
                              }
                            }
                          } else if (Array.isArray(val)) {
                            urls = val;
                          } else if (typeof val === 'object' && val !== null) {
                            if (val.content) return val.content;
                            if (val.fileName) return val.fileName;
                            return JSON.stringify(val);
                          }
                          
                          // Display URLs on separate lines if we found any
                          if (urls.length > 0) {
                            return (
                              <div className="space-y-1">
                                {urls.map((url: string, index: number) => (
                                  <div key={index} className="break-all text-xs text-blue-600">
                                    <a href={url.trim()} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                      {url.trim()}
                                    </a>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                        }
                        
                        // Special handling for Feedback column
                        if (columnName === 'Feedback') {
                          return (
                            <div className="flex items-center space-x-2">
                              <div className="flex-1 min-w-0">
                                {row.feedback ? (
                                  <div className="text-sm text-gray-700 truncate">{row.feedback}</div>
                                ) : (
                                  <div className="text-sm text-gray-400 italic">No feedback</div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleFeedbackOpen(row)}
                                className="flex-shrink-0"
                              >
                                <MessageSquare className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        }
                        
                        // Default handling for other columns
                        if (typeof val === 'string') return val;
                        if (typeof val === 'object' && val !== null) {
                          if (val.content) return val.content;
                          if (val.fileName) return val.fileName;
                          return JSON.stringify(val);
                        }
                        return String(val || '');
                      };
                      
                      const value = getDisplayValue(rawValue, column);
                      
                      return (
                        <td key={column} className={`border border-gray-300 px-4 py-2 text-sm text-gray-900 ${column === 'Reference Research' ? 'max-w-xs' : ''} ${column === 'Feedback' ? 'w-64' : ''}`}>
                          <div className={`${column === 'Reference Research' ? 'max-w-xs' : 'max-w-md'} break-words`}>
                            {/* Handle JSX elements (like formatted URLs) */}
                            {typeof value === 'object' && value !== null && React.isValidElement(value) ? (
                              value
                            ) : typeof value === 'string' && value.length > 200 ? (
                              <div>
                                {isCellExpanded(row.id, column) ? (
                                  <>
                                    <div className="whitespace-pre-wrap break-words">{value}</div>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="text-xs p-0 h-auto ml-2"
                                      onClick={() => toggleCellExpansion(row.id, column)}
                                    >
                                      Show less
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <div className="whitespace-pre-wrap break-words">{value.substring(0, 200)}...</div>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="text-xs p-0 h-auto ml-2"
                                      onClick={() => toggleCellExpansion(row.id, column)}
                                    >
                                      Show more
                                    </Button>
                                  </>
                                )}
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap break-words">{value}</div>
                            )}
                            {isAiGenerated && (
                              <div className="mt-2">
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="text-xs text-primary-600 p-0 h-auto"
                                  onClick={() => handleStepInspection(row.rowIndex)}
                                >
                                  <ExternalLink className="mr-1 h-3 w-3" />
                                  View AI Steps
                                </Button>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Step Inspection Panel */}
      <StepInspectionPanel
        open={inspectionOpen}
        onOpenChange={setInspectionOpen}
        jobId={jobId || null}
        rowIndex={selectedRowIndex}
      />

      {/* Feedback Dialog */}
      <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
        <DialogContent className="max-w-2xl" aria-describedby="feedback-dialog-description">
          <DialogHeader>
            <DialogTitle>
              {selectedRowForFeedback?.feedback ? 'Edit' : 'Add'} Feedback for Row {selectedRowForFeedback ? selectedRowForFeedback.rowIndex + 1 : ''}
            </DialogTitle>
          </DialogHeader>
          <div id="feedback-dialog-description" className="sr-only">
            Add feedback to improve AI responses for this RFP question
          </div>
          <div className="space-y-4">
            {selectedRowForFeedback && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium text-gray-700 mb-2">Original Question:</div>
                <div className="text-sm text-gray-600">
                  {Object.values(selectedRowForFeedback.originalData)[0] || 'No question text available'}
                </div>
                {selectedRowForFeedback.fullContextualQuestion && (
                  <>
                    <div className="text-sm font-medium text-gray-700 mb-2 mt-3">Full Contextual Question:</div>
                    <div className="text-sm text-gray-600">
                      {selectedRowForFeedback.fullContextualQuestion}
                    </div>
                  </>
                )}
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Your Feedback:
              </label>
              <Textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Provide specific feedback to improve the AI response. For example: 'Include more technical details about security features' or 'Focus on cost benefits for enterprise customers'..."
                className="min-h-[120px]"
              />
            </div>
            <div className="text-xs text-gray-500">
              💡 Tip: Your feedback will be used to find additional references and improve the final response using the o3 model. Only the final answer will be regenerated for faster processing.
            </div>
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={async () => {
                  // Clear feedback
                  setFeedbackText('');
                  await handleFeedbackSave('');
                }}
                className="text-red-600 hover:text-red-700"
                disabled={!selectedRowForFeedback?.feedback}
              >
                Clear Feedback
              </Button>
              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFeedbackDialogOpen(false);
                    setSelectedRowForFeedback(null);
                    setFeedbackText('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleFeedbackSave(feedbackText)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Save Feedback
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Feedback Dialog */}
      <Dialog open={bulkFeedbackDialogOpen} onOpenChange={setBulkFeedbackDialogOpen}>
        <DialogContent className="max-w-2xl" aria-describedby="bulk-feedback-dialog-description">
          <DialogHeader>
            <DialogTitle>Add Feedback to All Rows</DialogTitle>
          </DialogHeader>
          <div id="bulk-feedback-dialog-description" className="sr-only">
            Add the same feedback to all rows in the CSV for batch reprocessing
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-sm font-medium text-blue-700 mb-2">Bulk Feedback Application</div>
              <div className="text-sm text-blue-600">
                This will apply the same feedback to all {csvData.length} rows in your CSV. Each row will be reprocessed with this feedback to improve the responses.
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Feedback for All Rows:
              </label>
              <Textarea
                value={bulkFeedbackText}
                onChange={(e) => setBulkFeedbackText(e.target.value)}
                placeholder="Enter feedback that applies to all questions. For example: 'Focus on enterprise features and scalability' or 'Include more technical implementation details'..."
                className="min-h-[120px]"
              />
            </div>
            <div className="text-xs text-gray-500">
              💡 Tip: This feedback will be used to enhance all responses in the CSV. The system will search for additional references and improve each response based on your feedback.
            </div>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setBulkFeedbackDialogOpen(false);
                  setBulkFeedbackText('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkFeedbackSave}
                disabled={!bulkFeedbackText.trim()}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                Apply to All Rows
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
