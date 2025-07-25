import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Activity, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface HealthData {
  apiStatus: 'healthy' | 'degraded' | 'down';
  queueProcessing: number;
  workerUtilization: number;
  storageUsed: number;
  storageTotal: number;
  activeJobs: number;
  lastUpdated: string;
}

export function SystemHealth() {
  const { data: healthData, isLoading, error } = useQuery<HealthData>({
    queryKey: ['/api/system/health'],
    refetchInterval: 5000, // Refresh every 5 seconds
    retry: 3
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">System Health</CardTitle>
            <div className="flex items-center space-x-1">
              <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
              <span className="text-xs text-gray-500">Loading...</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="animate-pulse space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !healthData) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">System Health</CardTitle>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-error-500 rounded-full"></div>
              <span className="text-xs text-error-600 font-medium">Error</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Unable to load system health data</p>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-success-600';
      case 'degraded':
        return 'text-warning-600';
      case 'down':
        return 'text-error-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="mr-1 h-3 w-3" />;
      case 'degraded':
        return <Activity className="mr-1 h-3 w-3" />;
      case 'down':
        return <Activity className="mr-1 h-3 w-3" />;
      default:
        return <Activity className="mr-1 h-3 w-3" />;
    }
  };

  const formatLastUpdated = (timestamp: string) => {
    const now = new Date().getTime();
    const updated = new Date(timestamp).getTime();
    const diff = Math.floor((now - updated) / 1000);
    
    if (diff < 10) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">System Health</CardTitle>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              healthData.apiStatus === 'healthy' ? 'bg-success-500' : 
              healthData.apiStatus === 'degraded' ? 'bg-warning-500' : 'bg-error-500'
            }`}></div>
            <span className={`text-xs font-medium ${getStatusColor(healthData.apiStatus)}`}>
              {healthData.apiStatus === 'healthy' ? 'Operational' : 
               healthData.apiStatus === 'degraded' ? 'Degraded' : 'Down'}
            </span>
            <span className="text-xs text-gray-400">
              • {formatLastUpdated(healthData.lastUpdated)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col space-y-1">
            <span className="text-sm text-gray-600">API Status</span>
            <span className={`text-sm font-medium flex items-center ${getStatusColor(healthData.apiStatus)}`}>
              {getStatusIcon(healthData.apiStatus)}
              {healthData.apiStatus === 'healthy' ? 'Healthy' : 
               healthData.apiStatus === 'degraded' ? 'Degraded' : 'Down'}
            </span>
          </div>
          
          <div className="flex flex-col space-y-1">
            <span className="text-sm text-gray-600">Active Jobs</span>
            <span className="text-sm font-medium text-gray-900">
              {healthData.activeJobs} running
            </span>
          </div>
          
          <div className="flex flex-col space-y-1">
            <span className="text-sm text-gray-600">Processing Rate</span>
            <span className="text-sm font-medium text-success-600">
              {healthData.queueProcessing} rows/sec
            </span>
          </div>
          
          <div className="flex flex-col space-y-1">
            <span className="text-sm text-gray-600">Worker Utilization</span>
            <span className="text-sm font-medium text-gray-900">
              {healthData.workerUtilization}%
            </span>
          </div>
        </div>
        
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Storage Used</span>
            <span className="text-sm font-medium text-gray-900">
              {healthData.storageUsed} GB / {healthData.storageTotal} GB
            </span>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-primary-500 h-2 rounded-full" 
              style={{ width: `${(healthData.storageUsed / healthData.storageTotal) * 100}%` }}
            ></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
