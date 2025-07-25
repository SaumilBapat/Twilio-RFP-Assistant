import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CloudUpload, FolderOpen, FileText, Plus, X, FileIcon, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";



interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete: () => void;
}

export function UploadModal({ open, onOpenChange, onUploadComplete }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobName, setJobName] = useState("");
  const [priority, setPriority] = useState("normal");
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  // New RFP-specific fields
  const [additionalDocuments, setAdditionalDocuments] = useState<File[]>([]);
  const [rfpInstructions, setRfpInstructions] = useState(getDefaultRfpInstructions());
  const [additionalDocsDragActive, setAdditionalDocsDragActive] = useState(false);
  
  const { toast } = useToast();

  function getDefaultRfpInstructions(): string {
    return `# Default RFP Response Instructions

## Company Voice & Tone
- Write in first person as Twilio ("We provide...", "Our platform...")
- Use confident, professional tone that demonstrates expertise
- Emphasize innovation, reliability, and customer success

## Key Messaging Points
- Highlight Twilio's global scale and reliability (99.95% uptime)
- Emphasize developer-friendly APIs and extensive documentation
- Mention enterprise-grade security and compliance certifications
- Include specific metrics and customer success stories when relevant

## Response Structure
1. **Direct Answer**: Address the question clearly and concisely
2. **Twilio's Approach**: Explain how Twilio specifically handles this requirement
3. **Key Benefits**: List 3-4 main advantages of Twilio's solution
4. **Supporting Evidence**: Include metrics, certifications, or case studies
5. **Call to Action**: Invite further discussion or demonstration

## Compliance & Security Focus
- Always mention relevant security certifications (SOC 2, ISO 27001, GDPR compliance)
- Reference Twilio's Trust Center for detailed security information
- Highlight data residency options and privacy controls
- Mention audit capabilities and transparency reports

## Technical Details
- Include specific API capabilities when relevant
- Mention SDKs and supported programming languages
- Reference Twilio's extensive partner ecosystem
- Highlight scalability and global infrastructure

Please customize these instructions based on the specific RFP requirements and your company's unique value propositions.`;
  }

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

  const handleAdditionalDocsDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setAdditionalDocsDragActive(true);
    } else if (e.type === "dragleave") {
      setAdditionalDocsDragActive(false);
    }
  };

  const handleAdditionalDocsDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAdditionalDocsDragActive(false);
    
    if (e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files);
      setAdditionalDocuments(prev => [...prev, ...files]);
    }
  };

  const handleAdditionalDocsSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setAdditionalDocuments(prev => [...prev, ...files]);
    }
  };

  const removeAdditionalDocument = (index: number) => {
    setAdditionalDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "Missing information",
        description: "Please select a file",
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
      // Use default pipeline - backend will handle this
      formData.append('priority', priority);
      formData.append('rfpInstructions', rfpInstructions);
      
      // Add additional documents
      additionalDocuments.forEach((file, index) => {
        formData.append(`additionalDoc_${index}`, file);
      });

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
      setPriority("normal");
      setAdditionalDocuments([]);
      setRfpInstructions(getDefaultRfpInstructions());
      
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload RFP CSV - 3-Step Process</DialogTitle>
          <p className="text-sm text-gray-500">
            Reference Research (cached) → Generic Draft (cached) → Tailored Response (o3 model)
          </p>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* CSV File Upload Area - Step 1 */}
          <div className="space-y-2">
            <Label className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Step 1: Upload RFP CSV File
            </Label>
            <p className="text-sm text-gray-500">
              Upload your main RFP CSV file for processing through the 3-step pipeline
            </p>
          </div>
          
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
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
              <div className="space-y-3">
                <div className="w-12 h-12 bg-success-50 rounded-full flex items-center justify-center mx-auto">
                  <FileText className="text-success-500 h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-medium text-gray-900">{selectedFile.name}</h4>
                  <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedFile(null)}
                >
                  Choose Different File
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-12 h-12 bg-primary-50 rounded-full flex items-center justify-center mx-auto">
                  <CloudUpload className="text-primary-500 h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-medium text-gray-900">Drop your CSV file here</h4>
                  <p className="text-sm text-gray-500 mb-3">or click to browse (one file only)</p>
                  <label htmlFor="file-upload">
                    <Button asChild className="cursor-pointer">
                      <div>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Choose CSV File
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

          {/* Job Configuration */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="job-name">Job Name</Label>
              <Input
                id="job-name"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder="Enter job name"
              />
            </div>
          </div>

          <Separator />

          {/* Additional Documents Section */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold flex items-center gap-2">
                <FileIcon className="w-4 h-4" />
                Step 2: Additional RFP Documents (Optional)
              </Label>
              <p className="text-sm text-gray-500 mt-1">
                Upload supporting documents that will be used in Step 3 for tailored responses (company info, technical specs, etc.)
              </p>
            </div>

            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                additionalDocsDragActive 
                  ? 'border-blue-400 bg-blue-50' 
                  : 'border-gray-300 hover:border-blue-400'
              }`}
              onDragEnter={handleAdditionalDocsDrag}
              onDragLeave={handleAdditionalDocsDrag}
              onDragOver={handleAdditionalDocsDrag}
              onDrop={handleAdditionalDocsDrop}
            >
              <div className="space-y-2">
                <Plus className="w-6 h-6 text-gray-400 mx-auto" />
                <div>
                  <p className="text-sm text-gray-600">Drop additional documents here or click to browse</p>
                  <input
                    id="additional-docs"
                    type="file"
                    multiple
                    onChange={handleAdditionalDocsSelect}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.txt,.md"
                  />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="cursor-pointer mt-2"
                    onClick={() => document.getElementById('additional-docs')?.click()}
                  >
                    Browse Files
                  </Button>
                </div>
                <p className="text-xs text-gray-400">PDF, DOC, TXT, MD files supported (up to 5 files)</p>
              </div>
            </div>

            {/* Display selected additional documents */}
            {additionalDocuments.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Selected Documents:</p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {additionalDocuments.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <div className="flex items-center gap-2">
                        <FileIcon className="w-4 h-4 text-gray-500" />
                        <span className="text-sm truncate">{file.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {formatFileSize(file.size)}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAdditionalDocument(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* RFP Instructions Section */}
          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Step 3: RFP Response Instructions
              </Label>
              <p className="text-sm text-gray-500 mt-1">
                Customize instructions for Step 3 tailored responses. Default Twilio instructions are pre-populated.
              </p>
            </div>

            <ScrollArea className="h-48 w-full rounded border">
              <Textarea
                value={rfpInstructions}
                onChange={(e) => setRfpInstructions(e.target.value)}
                placeholder="Enter RFP-specific instructions..."
                className="min-h-[180px] border-0 resize-none focus-visible:ring-0"
              />
            </ScrollArea>
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
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? "Uploading..." : "Upload & Start 3-Step Process"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
