export function getStatusColor(status) {
  const map = {
    'received': 'text-slate-400',
    'investigating': 'text-indigo-400',
    'remediation_proposed': 'text-blue-400',
    'pending_human_review': 'text-amber-400',
    'human_approved': 'text-emerald-400',
    'human_denied': 'text-red-400',
    'resolved': 'text-emerald-400',
    'reported': 'text-emerald-400',
    'failed_closed': 'text-red-400'
  };
  return map[status] || 'text-slate-400';
}

export function getStatusEmoji(status) {
  const map = {
    'received': '🔍',
    'investigating': '⚙️',
    'remediation_proposed': '🛡️',
    'pending_human_review': '⚠️',
    'human_approved': '✅',
    'human_denied': '❌',
    'resolved': '🎉',
    'reported': '📄',
    'failed_closed': '🔴'
  };
  return map[status] || '🔍';
}

export function getTimeAgo(createdAt) {
  if (!createdAt) return 'Detected just now';
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins <= 0) return 'Detected just now';
  if (diffMins < 60) return `Detected ${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Detected ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Detected ${diffDays}d ago`;
}

export function getUrgency(threatScore) {
  const score = threatScore ?? 0;
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}
