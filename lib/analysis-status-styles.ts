export interface AnalysisStatusDisplay {
  badgeText: string;
  styleClass: string;
  color: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
}

export function getAnalysisStatusDisplay(status: string | null | undefined): AnalysisStatusDisplay {
  const normalizedStatus = (status || 'PENDING').toUpperCase();

  switch (normalizedStatus) {
    case 'SUCCESS':
    case 'SUCCESSFUL':
    case 'COMPLETED':
      return {
        badgeText: 'Successful',
        styleClass: 'success',
        color: 'green',
        borderClass: 'border-l-4 border-green-500',
        bgClass: 'bg-green-50 dark:bg-green-950',
        textClass: 'text-green-700 dark:text-green-300',
        badgeVariant: 'success'
      };

    case 'FAILED':
    case 'FAIL':
    case 'STOPPED':
      return {
        badgeText: 'Failed',
        styleClass: 'failed',
        color: 'red',
        borderClass: 'border-l-4 border-red-500',
        bgClass: 'bg-red-50 dark:bg-red-950',
        textClass: 'text-red-700 dark:text-red-300',
        badgeVariant: 'destructive'
      };

    case 'IN_PROGRESS':
    case 'ACTIVE':
      return {
        badgeText: 'Active',
        styleClass: 'active',
        color: 'blue',
        borderClass: 'border-l-4 border-blue-500',
        bgClass: 'bg-blue-50 dark:bg-blue-950',
        textClass: 'text-blue-700 dark:text-blue-300',
        badgeVariant: 'default'
      };

    case 'PENDING':
    case 'DRAFT':
      return {
        badgeText: 'Pending',
        styleClass: 'pending',
        color: 'gray',
        borderClass: 'border-l-4 border-gray-500',
        bgClass: 'bg-gray-50 dark:bg-gray-900',
        textClass: 'text-gray-700 dark:text-gray-300',
        badgeVariant: 'secondary'
      };

    case 'EXPIRED':
      return {
        badgeText: 'Expired',
        styleClass: 'expired',
        color: 'orange',
        borderClass: 'border-l-4 border-orange-500',
        bgClass: 'bg-orange-50 dark:bg-orange-950',
        textClass: 'text-orange-700 dark:text-orange-300',
        badgeVariant: 'outline'
      };

    default:
      return {
        badgeText: 'Unknown',
        styleClass: 'unknown',
        color: 'gray',
        borderClass: 'border-l-4 border-gray-300',
        bgClass: 'bg-gray-50 dark:bg-gray-900',
        textClass: 'text-gray-600 dark:text-gray-400',
        badgeVariant: 'outline'
      };
  }
}

export function isAnalysisSuccessful(status: string | null | undefined): boolean {
  const normalizedStatus = (status || '').toUpperCase();
  return normalizedStatus === 'SUCCESS' || normalizedStatus === 'SUCCESSFUL' || normalizedStatus === 'COMPLETED';
}

export function isAnalysisFailed(status: string | null | undefined): boolean {
  const normalizedStatus = (status || '').toUpperCase();
  return normalizedStatus === 'FAILED' || normalizedStatus === 'FAIL' || normalizedStatus === 'STOPPED';
}

export function isAnalysisActive(status: string | null | undefined): boolean {
  const normalizedStatus = (status || '').toUpperCase();
  return normalizedStatus === 'IN_PROGRESS' || normalizedStatus === 'ACTIVE';
}
