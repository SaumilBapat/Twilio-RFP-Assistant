import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Play, Pause, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityItem {
  id: string;
  type: 'completed' | 'started' | 'paused';
  fileName: string;
  timestamp: string;
}

interface RecentActivityProps {
  activities?: ActivityItem[];
}

export function RecentActivity({ activities = [] }: RecentActivityProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-success-500" />;
      case 'started':
        return <Play className="h-4 w-4 text-primary-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-warning-500" />;
      default:
        return <History className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActivityText = (activity: ActivityItem) => {
    switch (activity.type) {
      case 'completed':
        return (
          <p className="text-sm text-gray-900">
            <span className="font-medium">{activity.fileName}</span> completed
          </p>
        );
      case 'started':
        return (
          <p className="text-sm text-gray-900">
            Started processing <span className="font-medium">{activity.fileName}</span>
          </p>
        );
      case 'paused':
        return (
          <p className="text-sm text-gray-900">
            Paused <span className="font-medium">{activity.fileName}</span>
          </p>
        );
      default:
        return (
          <p className="text-sm text-gray-900">
            <span className="font-medium">{activity.fileName}</span>
          </p>
        );
    }
  };

  const getActivityBgColor = (type: string) => {
    switch (type) {
      case 'completed':
        return 'bg-success-50';
      case 'started':
        return 'bg-primary-50';
      case 'paused':
        return 'bg-warning-50';
      default:
        return 'bg-gray-50';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
          <History className="h-5 w-5 text-gray-400" />
        </div>
      </CardHeader>
      <CardContent>
        {activities.length > 0 ? (
          <div className="space-y-4">
            {activities.slice(0, 5).map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3">
                <div className={`w-8 h-8 ${getActivityBgColor(activity.type)} rounded-full flex items-center justify-center mt-0.5`}>
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  {getActivityText(activity)}
                  <p className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <History className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No recent activity</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
