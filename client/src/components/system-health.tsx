import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Activity } from "lucide-react";

interface SystemHealthProps {
  health?: {
    apiStatus: 'healthy' | 'degraded' | 'down';
    queueProcessing: number;
    workerUtilization: number;
    storageUsed: number;
    storageTotal: number;
  };
}

export function SystemHealth({ health }: SystemHealthProps) {
  const defaultHealth = {
    apiStatus: 'healthy' as const,
    queueProcessing: 2.4,
    workerUtilization: 67,
    storageUsed: 2.1,
    storageTotal: 100
  };

  const healthData = health || defaultHealth;

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">System Health</CardTitle>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-success-500 rounded-full"></div>
            <span className="text-xs text-success-600 font-medium">Operational</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">API Status</span>
          <span className={`text-sm font-medium ${getStatusColor(healthData.apiStatus)}`}>
            {getStatusIcon(healthData.apiStatus)}
            {healthData.apiStatus === 'healthy' ? 'Healthy' : 
             healthData.apiStatus === 'degraded' ? 'Degraded' : 'Down'}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Queue Processing</span>
          <span className="text-sm font-medium text-success-600">
            {healthData.queueProcessing} rows/sec
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Worker Utilization</span>
          <span className="text-sm font-medium text-gray-900">
            {healthData.workerUtilization}%
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Storage Used</span>
          <span className="text-sm font-medium text-gray-900">
            {healthData.storageUsed} GB / {healthData.storageTotal} GB
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
