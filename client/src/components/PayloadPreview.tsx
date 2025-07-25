import { Card, CardContent } from "@/components/ui/card";
import { formatPayloadSize } from "./ProcessingStatusIcon";

interface PayloadPreviewProps {
  totalPayload: number;
  totalChunks: number;
  pendingItems: number;
  processingItems: number;
  completedItems: number;
}

export function PayloadPreview({
  totalPayload,
  totalChunks,
  pendingItems,
  processingItems,
  completedItems
}: PayloadPreviewProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <h4 className="font-semibold mb-3">Processing Overview</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Total Payload:</span>
            <span className="ml-2 font-medium">{formatPayloadSize(totalPayload)}</span>
          </div>
          <div>
            <span className="text-gray-600">Estimated Chunks:</span>
            <span className="ml-2 font-medium">{totalChunks}</span>
          </div>
          <div>
            <span className="text-gray-600">Pending:</span>
            <span className="ml-2 font-medium text-yellow-600">{pendingItems}</span>
          </div>
          <div>
            <span className="text-gray-600">Processing:</span>
            <span className="ml-2 font-medium text-blue-600">{processingItems}</span>
          </div>
          <div>
            <span className="text-gray-600">Completed:</span>
            <span className="ml-2 font-medium text-green-600">{completedItems}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}