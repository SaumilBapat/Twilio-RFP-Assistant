import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Zap, Save } from "lucide-react";

interface QuickActionsProps {
  onUploadClick: () => void;
  onPipelineBuilderClick: () => void;
}

export function QuickActions({ onUploadClick, onPipelineBuilderClick }: QuickActionsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
          <Zap className="h-5 w-5 text-primary-500" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="ghost"
          className="w-full justify-start p-3 h-auto hover:bg-gray-50"
          onClick={onUploadClick}
        >
          <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center mr-3">
            <Upload className="h-4 w-4 text-primary-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Upload New CSV</p>
            <p className="text-xs text-gray-500">Start a new processing job</p>
          </div>
        </Button>
        
        <Button
          variant="ghost"
          className="w-full justify-start p-3 h-auto hover:bg-gray-50"
          onClick={onPipelineBuilderClick}
        >
          <div className="w-8 h-8 bg-warning-50 rounded-lg flex items-center justify-center mr-3">
            <Zap className="h-4 w-4 text-warning-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Create Pipeline</p>
            <p className="text-xs text-gray-500">Build custom AI workflow</p>
          </div>
        </Button>
        
        <Button
          variant="ghost"
          className="w-full justify-start p-3 h-auto hover:bg-gray-50"
        >
          <div className="w-8 h-8 bg-success-50 rounded-lg flex items-center justify-center mr-3">
            <Save className="h-4 w-4 text-success-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">Save Template</p>
            <p className="text-xs text-gray-500">Create reusable configuration</p>
          </div>
        </Button>
      </CardContent>
    </Card>
  );
}
