import { CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';

interface ProcessingStatusIconProps {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  className?: string;
}

export function ProcessingStatusIcon({ status, className = "h-5 w-5" }: ProcessingStatusIconProps) {
  switch (status) {
    case 'completed':
      return <CheckCircle className={`${className} text-green-600`} />;
    case 'processing': 
      return <Loader2 className={`${className} text-blue-600 animate-spin`} />;
    case 'failed':
      return <AlertCircle className={`${className} text-red-600`} />;
    case 'pending':
    default:
      return <Clock className={`${className} text-yellow-600`} />;
  }
}

export function formatPayloadSize(bytes: number): string {
  if (bytes === 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}