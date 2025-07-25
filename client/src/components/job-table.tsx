import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Search, 
  Table, 
  Download, 
  ExternalLink, 
  Pause, 
  Play, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Trash2,
  RotateCcw,
  RefreshCw
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Job {
  id: string;
  name: string;
  fileName: string;
  fileSize: number;
  status: string;
  totalRows: number;
  processedRows: number;
  progress: number;
  pipelineId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface JobTableProps {
  jobs: Job[];
  onJobUpdate: () => void;
}

export function JobTable({ jobs, onJobUpdate }: JobTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      completed: { variant: "default" as const, className: "bg-success-100 text-success-800", label: "Completed" },
      in_progress: { variant: "default" as const, className: "bg-primary-100 text-primary-800", label: "In Progress" },
      paused: { variant: "default" as const, className: "bg-warning-100 text-warning-800", label: "Paused" },
      not_started: { variant: "secondary" as const, className: "", label: "Not Started" },
      error: { variant: "destructive" as const, className: "", label: "Error" },
      cancelled: { variant: "secondary" as const, className: "", label: "Cancelled" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.not_started;
    
    return (
      <Badge variant={config.variant} className={config.className}>
        <div className="w-1.5 h-1.5 bg-current rounded-full mr-1.5" />
        {config.label}
      </Badge>
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleJobAction = async (jobId: string, action: string) => {
    try {
      await apiRequest('POST', `/api/jobs/${jobId}/${action}`);
      toast({
        title: "Success",
        description: `Job ${action}ed successfully`,
      });
      onJobUpdate();
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} job`,
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/export`, {
        credentials: 'include',
        headers: { 'x-user-id': 'user-1' } // TODO: Get from auth context
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'export.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "CSV exported successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export CSV",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (jobId: string, jobName: string) => {
    if (!confirm(`Are you sure you want to delete "${jobName}"? This will permanently remove the job and all associated data.`)) {
      return;
    }

    try {
      await apiRequest('DELETE', `/api/jobs/${jobId}`);
      toast({
        title: "Success",
        description: "Job deleted successfully",
      });
      onJobUpdate();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete job",
        variant: "destructive",
      });
    }
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         job.fileName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Recent Jobs</h3>
            <div className="mt-3 sm:mt-0 flex items-center space-x-3">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search jobs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  File Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rows
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredJobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center mr-3">
                        <FileText className="text-primary-500 h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{job.fileName}</div>
                        <div className="text-sm text-gray-500">{formatFileSize(job.fileSize)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(job.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-full bg-gray-200 rounded-full h-2 mr-3" style={{ width: '120px' }}>
                        <div 
                          className="bg-primary-500 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-700">{job.progress}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {job.totalRows.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>
                      {formatDistanceToNow(new Date(job.updatedAt), { addSuffix: true })}
                      {job.status === 'in_progress' && (
                        <div className="text-xs text-blue-600 mt-1">
                          Processing row {job.processedRows + 1}...
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      {job.status === 'not_started' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleJobAction(job.id, 'start')}
                          className="text-success-600 hover:text-success-900"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      {job.status === 'in_progress' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleJobAction(job.id, 'pause')}
                            className="text-warning-600 hover:text-warning-900"
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleJobAction(job.id, 'reset')}
                            className="text-orange-600 hover:text-orange-900"
                            title="Reset - Clear all progress and start fresh"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {job.status === 'paused' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleJobAction(job.id, 'resume')}
                            className="text-success-600 hover:text-success-900"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleJobAction(job.id, 'reset')}
                            className="text-orange-600 hover:text-orange-900"
                            title="Reset - Clear all progress and start fresh"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {(job.status === 'completed' || job.status === 'error') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleJobAction(job.id, 'reprocess')}
                          className="text-blue-600 hover:text-blue-900"
                          title="Reprocess - Clear AI results and restart"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocation(`/spreadsheet/${job.id}`)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        <Table className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(job.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(job.id, job.name)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredJobs.length === 0 && (
          <div className="px-6 py-8 text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {jobs.length === 0 ? "Get started by uploading your first CSV file." : "Try adjusting your search or filter."}
            </p>
          </div>
        )}

        {filteredJobs.length > 0 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <Button variant="outline" size="sm">
                Previous
              </Button>
              <Button variant="outline" size="sm">
                Next
              </Button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">1</span> to{' '}
                  <span className="font-medium">{Math.min(10, filteredJobs.length)}</span> of{' '}
                  <span className="font-medium">{filteredJobs.length}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <Button variant="outline" size="sm" className="rounded-l-md">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="bg-primary-50 border-primary-500 text-primary-600">
                    1
                  </Button>
                  <Button variant="outline" size="sm">
                    2
                  </Button>
                  <Button variant="outline" size="sm">
                    3
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-r-md">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
