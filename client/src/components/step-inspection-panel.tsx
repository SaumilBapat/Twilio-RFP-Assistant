import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface JobStep {
  id: string;
  stepIndex: number;
  stepName: string;
  status: string;
  inputData: any;
  outputData: any;
  prompt: string;
  model: string;
  latency: number;
  errorMessage?: string;
}

interface StepInspectionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string | null;
  rowIndex: number | null;
}

export function StepInspectionPanel({ open, onOpenChange, jobId, rowIndex }: StepInspectionPanelProps) {
  const [steps, setSteps] = useState<JobStep[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && jobId !== null && rowIndex !== null) {
      fetchSteps();
    }
  }, [open, jobId, rowIndex]);

  const fetchSteps = async () => {
    if (!jobId || rowIndex === null) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/steps/${rowIndex}`, {
        credentials: 'include',
        headers: { 'x-user-id': 'user-1' } // TODO: Get from auth context
      });
      
      if (response.ok) {
        const data = await response.json();
        setSteps(data);
      }
    } catch (error) {
      console.error('Failed to fetch steps:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      completed: { variant: "default" as const, className: "bg-success-100 text-success-800" },
      running: { variant: "default" as const, className: "bg-primary-100 text-primary-800" },
      error: { variant: "destructive" as const, className: "" },
      pending: { variant: "secondary" as const, className: "" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-96 sm:max-w-96">
        <SheetHeader>
          <SheetTitle>AI Processing Steps</SheetTitle>
          <p className="text-sm text-gray-500">
            Row {rowIndex !== null ? rowIndex + 1 : '-'} - Step by step execution
          </p>
        </SheetHeader>

        <div className="mt-6 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          ) : steps.length > 0 ? (
            <div className="space-y-6">
              {steps.map((step, index) => (
                <div key={step.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {step.stepIndex + 1}
                      </div>
                      <h4 className="text-sm font-semibold text-gray-900">{step.stepName}</h4>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(step.status)}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Latency: {step.latency}ms</span>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>{step.latency}ms</span>
                      </div>
                    </div>
                    
                    <div>
                      <h5 className="text-xs font-medium text-gray-700 mb-1">Model & Settings</h5>
                      <div className="text-xs text-gray-600 font-mono bg-gray-50 p-2 rounded">
                        {step.model} | temp: 0.0
                      </div>
                    </div>
                    
                    {step.prompt && (
                      <div>
                        <h5 className="text-xs font-medium text-gray-700 mb-1">Prompt</h5>
                        <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded max-h-24 overflow-y-auto">
                          {step.prompt}
                        </div>
                      </div>
                    )}
                    
                    {step.outputData && (
                      <div>
                        <h5 className="text-xs font-medium text-gray-700 mb-1">Output</h5>
                        <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded max-h-32 overflow-y-auto">
                          {typeof step.outputData === 'string' 
                            ? step.outputData 
                            : JSON.stringify(step.outputData, null, 2)
                          }
                        </div>
                      </div>
                    )}
                    
                    {step.errorMessage && (
                      <div>
                        <h5 className="text-xs font-medium text-error-700 mb-1">Error</h5>
                        <div className="text-xs text-error-600 bg-error-50 p-2 rounded">
                          {step.errorMessage}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No steps found for this row</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
