import { RemediationAction } from '../schemas/incident-state.js';

export interface AnsibleTask {
  name: string;
  action: string;
  args?: Record<string, any>;
  when?: string;
}

export interface AnsiblePlaybook {
  name: string;
  hosts: string;
  become?: boolean;
  vars?: Record<string, any>;
  tasks: AnsibleTask[];
}

export interface RemediationExecutionResult {
  success: boolean;
  playbook: string;
  executedTasks: string[];
  failedTasks: string[];
  output: string;
  executionTimeMs: number;
}

export async function generateAnsiblePlaybook(
  action: RemediationAction
): Promise<AnsiblePlaybook> {
  const basePlaybook: AnsiblePlaybook = {
    name: `Remediation for ${action.actionType}`,
    hosts: 'all',
    become: true,
    vars: {
      ...action.params,
      remediation_timestamp: new Date().toISOString(),
    },
    tasks: [],
  };

  switch (action.actionType) {
    case 'block_ip':
      return {
        ...basePlaybook,
        name: 'Block Malicious IP Address',
        tasks: [
          {
            name: 'Block IP on firewall',
            action: 'iptables',
            args: {
              chain: 'INPUT',
              source: action.params.target_ip,
              jump: 'DROP',
              comment: 'Block malicious IP from security incident response',
            },
          },
          {
            name: 'Verify IP is blocked',
            action: 'shell',
            args: {
              cmd: `iptables -C INPUT -s ${action.params.target_ip} -j DROP || echo "Rule not found"`,
            },
          },
        ],
      };

    case 'isolate_host':
      return {
        ...basePlaybook,
        name: 'Isolate Compromised Host',
        tasks: [
          {
            name: 'Disable network interfaces',
            action: 'ansible.builtin.raw',
            args: {
              cmd: 'nmcli networking off || ifconfig eth0 down',
            },
          },
          {
            name: 'Quarantine host in CMDB',
            action: 'uri',
            args: {
              url: `https://cmdb.example.com/api/hosts/${action.params.target_host || action.params.host}/quarantine`,
              method: 'POST',
              body_format: 'json',
              body: { quarantined: true, reason: 'security_incident' },
            },
          },
        ],
      };

    case 'rotate_credential':
      return {
        ...basePlaybook,
        name: 'Rotate Compromised Credentials',
        tasks: [
          {
            name: 'Generate new credential',
            action: 'password',
            args: {
              length: 32,
              chars: 'ascii_letters,digits',
            },
          },
          {
            name: 'Update credential on target host',
            action: 'lineinfile',
            args: {
              path: `/etc/secrets/${action.params.host || 'app'}.creds`,
              regexp: '^password=',
              line: 'password={{ generated_password }}',
              backup: true,
            },
          },
          {
            name: 'Restart services with new credential',
            action: 'systemd',
            args: {
              name: 'application',
              state: 'restarted',
            },
          },
        ],
      };

    case 'patch_rule':
      return {
        ...basePlaybook,
        name: 'Apply Security Rule Patch',
        tasks: [
          {
            name: 'Apply WAF rule update',
            action: 'copy',
            args: {
              src: 'waf_patch.conf',
              dest: '/etc/nginx/conf.d/security_patch.conf',
              owner: 'root',
              group: 'root',
              mode: '0644',
            },
          },
          {
            name: 'Reload WAF configuration',
            action: 'systemd',
            args: {
              name: 'nginx',
              state: 'reloaded',
            },
          },
        ],
      };

    default:
      return {
        ...basePlaybook,
        name: 'Generic Security Remediation',
        tasks: [
          {
            name: 'Log remediation action',
            action: 'debug',
            args: {
              msg: `Remediation action: ${action.actionType} for incident response`,
            },
          },
        ],
      };
  }
}

export async function executeRemediation(
  playbook: AnsiblePlaybook
): Promise<RemediationExecutionResult> {
  const startTime = Date.now();
  const executedTasks: string[] = [];
  const failedTasks: string[] = [];
  const outputLines: string[] = [];

  for (const task of playbook.tasks) {
    try {
      outputLines.push(`Executing task: ${task.name}`);
      executedTasks.push(task.name);
    } catch (error) {
      failedTasks.push(task.name);
      outputLines.push(`Failed task: ${task.name} - ${error}`);
    }
  }

  const executionTimeMs = Date.now() - startTime;

  return {
    success: failedTasks.length === 0,
    playbook: playbook.name,
    executedTasks,
    failedTasks,
    output: outputLines.join('\n'),
    executionTimeMs,
  };
}

export function generateRemediationSummary(
  results: RemediationExecutionResult[]
): { totalActions: number; successfulActions: number; failedActions: number } {
  const totalActions = results.length;
  const successfulActions = results.filter((r) => r.success).length;
  const failedActions = totalActions - successfulActions;

  return { totalActions, successfulActions, failedActions };
}