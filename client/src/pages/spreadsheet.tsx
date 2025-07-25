import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Filter, Search, Download, Edit, ExternalLink, Play, Pause } from "lucide-react";
import { StepInspectionPanel } from "@/components/step-inspection-panel";
import { authService } from "@/lib/auth";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CsvRow {
  id: string;
  rowIndex: number;
  originalData: Record<string, any>;
  enrichedData?: Record<string, any>;
}

interface Job {
  id: string;
  name: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
}

export default function Spreadsheet() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const user = authService.getCurrentUser();
  const jobId = params.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['/api/jobs', jobId],
    queryFn: () => fetch(`/api/jobs/${jobId}`, {
      credentials: 'include',
      headers: { 'x-user-id': user?.id || 'user-1' }
    }).then(res => res.json()),
    enabled: !!jobId
  });

  const { data: csvData = [], isLoading: dataLoading } = useQuery({
    queryKey: ['/api/jobs', jobId, 'csv-data'],
    queryFn: () => fetch(`/api/jobs/${jobId}/csv-data`, {
      credentials: 'include',
      headers: { 'x-user-id': user?.id || 'user-1' }
    }).then(res => res.json()),
    enabled: !!jobId,
    refetchInterval: job?.status === 'in_progress' ? 2000 : false, // Poll every 2 seconds when job is in progress
  });

  // WebSocket connection for real-time updates
  const { lastMessage } = useWebSocket(user?.id || '');

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;
    
    const { type, payload } = lastMessage;
    if (payload?.jobId === jobId) {
      switch (type) {
        case 'jobStarted':
        case 'jobPaused':
        case 'jobCompleted':
        case 'jobError':
          // Refetch job data
          queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
          break;
        case 'rowProcessed':
          // Refetch both job and CSV data for progress updates
          queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
          queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId, 'csv-data'] });
          
          toast({
            title: "Processing Update",
            description: `Row ${payload.rowIndex + 1} processed (${payload.progress}% complete)`,
          });
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

  const handleJobAction = async (action: string) => {
    if (!jobId) return;
    
    try {
      await apiRequest('POST', `/api/jobs/${jobId}/${action}`);
      toast({
        title: "Success",
        description: `Job ${action}${action.endsWith('e') ? 'd' : 'ed'} successfully`,
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

  const getAllColumns = () => {
    if (csvData.length === 0) return [];
    
    const firstRow = csvData[0];
    const originalColumns = Object.keys(firstRow.originalData || {});
    const enrichedColumns = Object.keys(firstRow.enrichedData || {}).filter(
      key => !originalColumns.includes(key)
    );
    
    return [...originalColumns, ...enrichedColumns];
  };

  const columns = getAllColumns();

  if (jobLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
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
                <Button
                  onClick={() => handleJobAction('pause')}
                  variant="outline"
                  className="text-warning-600 border-warning-600 hover:bg-warning-50"
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </Button>
              )}
              {job.status === 'paused' && (
                <Button
                  onClick={() => handleJobAction('resume')}
                  className="bg-success-600 hover:bg-success-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </Button>
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
                      className="border border-gray-300 px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase min-w-48"
                    >
                      {column}
                    </th>
                  ))}
                  <th className="border border-gray-300 px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {csvData.map((row: CsvRow, index: number) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2 text-sm text-gray-900">
                      {row.rowIndex + 1}
                    </td>
                    {columns.map((column) => {
                      const value = row.enrichedData?.[column] || row.originalData?.[column] || '';
                      const isAiGenerated = row.enrichedData && row.enrichedData[column];
                      
                      return (
                        <td key={column} className="border border-gray-300 px-4 py-2 text-sm text-gray-900">
                          <div className="max-w-md">
                            {typeof value === 'string' && value.length > 200 ? (
                              <div>
                                {value.substring(0, 200)}...
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="text-xs p-0 h-auto"
                                  onClick={() => {/* TODO: Show full text */}}
                                >
                                  Show more
                                </Button>
                              </div>
                            ) : (
                              value
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
                    <td className="border border-gray-300 px-4 py-2 text-center">
                      <Button variant="ghost" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </td>
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
    </div>
  );
}
