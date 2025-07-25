import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CloudUpload, FolderOpen, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Pipeline {
  id: string;
  name: string;
  description?: string;
}

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelines: Pipeline[];
  onUploadComplete: () => void;
}

export function UploadModal({ open, onOpenChange, pipelines, onUploadComplete }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobName, setJobName] = useState("");
  const [selectedPipeline, setSelectedPipeline] = useState("");
  const [priority, setPriority] = useState("normal");
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const { toast } = useToast();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "text/csv" || file.name.endsWith('.csv')) {
        setSelectedFile(file);
        if (!jobName) {
          setJobName(file.name.replace('.csv', ''));
        }
      } else {
        toast({
          title: "Invalid file type",
          description: "Please select a CSV file",
          variant: "destructive",
        });
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!jobName) {
        setJobName(file.name.replace('.csv', ''));
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedPipeline) {
      toast({
        title: "Missing information",
        description: "Please select a file and pipeline",
        variant: "destructive",
      });
      return;
    }

    if (selectedFile.size > 25 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "File size must be less than 25MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('csvFile', selectedFile);
      formData.append('name', jobName || selectedFile.name);
      formData.append('pipelineId', selectedPipeline);
      formData.append('priority', priority);

      const response = await fetch('/api/jobs', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          'x-user-id': 'user-1' // TODO: Get from auth context
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();

      toast({
        title: "Upload successful",
        description: `Job "${jobName}" uploaded successfully. Click into the spreadsheet to start processing when ready.`,
      });

      // Reset form
      setSelectedFile(null);
      setJobName("");
      setSelectedPipeline("");
      setPriority("normal");
      
      onUploadComplete();
      onOpenChange(false);

    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload CSV File</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragActive 
                ? 'border-primary-400 bg-primary-50' 
                : 'border-gray-300 hover:border-primary-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-success-50 rounded-full flex items-center justify-center mx-auto">
                  <FileText className="text-success-500 h-8 w-8" />
                </div>
                <div>
                  <h4 className="text-lg font-medium text-gray-900">{selectedFile.name}</h4>
                  <p className="text-gray-500">{formatFileSize(selectedFile.size)}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setSelectedFile(null)}
                  className="mt-2"
                >
                  Choose Different File
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto">
                  <CloudUpload className="text-primary-500 h-8 w-8" />
                </div>
                <div>
                  <h4 className="text-lg font-medium text-gray-900">Drop your CSV file here</h4>
                  <p className="text-gray-500 mb-4">or click to browse</p>
                  <label htmlFor="file-upload">
                    <Button asChild className="cursor-pointer">
                      <div>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Choose File
                      </div>
                    </Button>
                  </label>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-gray-400">Maximum file size: 25MB, up to 5,000 rows</p>
              </div>
            )}
          </div>

          {/* Pipeline Selection */}
          <div>
            <Label htmlFor="pipeline">Select AI Pipeline</Label>
            <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Job Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="jobName">Job Name</Label>
              <Input
                id="jobName"
                type="text"
                placeholder="Enter job name"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpload}
              disabled={!selectedFile || !selectedPipeline || isUploading}
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
