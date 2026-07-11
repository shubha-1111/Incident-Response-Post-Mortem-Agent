export interface SimulationScenario {
  id: string;
  name: string;
  description: string;
  expectedMitre: string[];
  expectedHitl: boolean;
  generateLogs: () => string[];
}

function timestamp(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function timestampOffset(minutesAhead: number): string {
  return new Date(Date.now() + minutesAhead * 60 * 1000).toISOString();
}

export const SCENARIOS: Record<string, SimulationScenario> = {
  credential_stuffing: {
    id: 'credential_stuffing',
    name: 'Credential Stuffing Attack',
    description: 'Mass failed login attempts from distributed IPs escalating to unauthorized access and data exfiltration',
    expectedMitre: ['T1110.004'],
    expectedHitl: true,
    generateLogs: () => {
      const ips = ['192.168.1.105', '192.168.1.106', '192.168.1.107', '10.0.0.45', '10.0.0.46'];
      const users = ['admin', 'db_admin', 'root', 'oracle', 'postgres', 'svc_backup'];
      const logs: string[] = [];

      for (let i = 0; i < 120; i++) {
        const ip = ips[i % ips.length];
        const user = users[i % users.length];
        logs.push(`${timestamp(2 - i * 0.02)},${ip},api-gw-01,sshd,info,Failed password for invalid user ${user}`);
      }

      for (let i = 0; i < 12; i++) {
        const ip = ips[i % ips.length];
        logs.push(`${timestampOffset(i * 0.02)},${ip},api-gw-01,nginx,warn,POST /admin/auth brute-force pattern detected`);
      }

      logs.push(`${timestampOffset(0.3)},192.168.1.105,db-prod-02,mysqld,critical,Privilege escalation: root shell spawned by mysql user`);
      logs.push(`${timestampOffset(0.35)},192.168.1.105,db-prod-02,auditd,critical,DATA_EXFIL of customer records to 192.168.1.105`);

      return logs;
    }
  },

  port_scan: {
    id: 'port_scan',
    name: 'Port Scan Detection',
    description: 'Sequential port probe attempts escalating to mass scan and service enumeration',
    expectedMitre: ['T1046'],
    expectedHitl: false,
    generateLogs: () => {
      const ips = ['203.0.113.42', '203.0.113.43', '198.51.100.7'];
      const logs: string[] = [];

      for (let i = 0; i < 80; i++) {
        const ip = ips[i % ips.length];
        const port = 20 + (i % 1000);
        const level = i > 60 ? 'warn' : 'info';
        logs.push(`${timestamp(2 - i * 0.025)},${ip},api-gw-01,firewall,${level},Port probe attempt on port ${port} from ${ip}`);
      }

      logs.push(`${timestampOffset(0.1)},203.0.113.42,api-gw-01,ids,CRITICAL,Masscan signature detected: 1000 ports scanned in 3s`);
      logs.push(`${timestampOffset(0.15)},203.0.113.42,api-gw-01,ssh,HIGH,SSH brute force attempt on port 22 from 203.0.113.42`);

      return logs;
    }
  },

  sql_injection: {
    id: 'sql_injection',
    name: 'SQL Injection Attack',
    description: 'Progressive SQL injection attempts escalating to data breach and record exfiltration',
    expectedMitre: ['T1190'],
    expectedHitl: true,
    generateLogs: () => {
      const logs: string[] = [];
      const payloads = [
        "id=1' OR '1'='1",
        "id=1 UNION SELECT username,password FROM users",
        "id=1; DROP TABLE incidents--",
        "id=1' AND 1=SLEEP(5)--",
        "id=1' OR EXISTS(SELECT * FROM users)--",
        "id=1' UNION SELECT * FROM credit_cards--",
      ];

      for (let i = 0; i < 100; i++) {
        const payload = payloads[i % payloads.length];
        const level = i > 85 ? 'error' : 'warn';
        logs.push(`${timestamp(2 - i * 0.02)},203.0.113.99,web-01,nginx,${level},SQL_INJECTION attempt detected: ${payload}`);
      }

      logs.push(`${timestampOffset(0.1)},203.0.113.99,web-01,waf,CRITICAL,Data exfiltration detected: sensitive records dumped via UNION SELECT`);
      logs.push(`${timestampOffset(0.2)},203.0.113.99,db-prod-02,mysqld,CRITICAL,Unauthorized SELECT on table customers with 5000 rows returned`);

      return logs;
    }
  },

  ransomware: {
    id: 'ransomware',
    name: 'Ransomware Attack',
    description: 'File encryption process with lateral movement and ransom note deployment',
    expectedMitre: ['T1486', 'T1021', 'T1059'],
    expectedHitl: true,
    generateLogs: () => {
      const logs: string[] = [];
      const hosts = ['web-01', 'db-prod-02', 'file-server-01', 'backup-server'];
      
      // Initial compromise
      logs.push(`${timestamp(5)},203.0.113.50,web-01,nginx,warn,Suspicious file upload: encryptor.exe`);
      logs.push(`${timestamp(4.9)},203.0.113.50,web-01,waf,error,Executable file upload blocked, bypass attempted`);
      logs.push(`${timestamp(4.8)},203.0.113.50,web-01,auditd,critical,Process spawned: powershell.exe -encodedCommand`);
      
      // Lateral movement
      for (let i = 0; i < 15; i++) {
        const host = hosts[i % hosts.length];
        logs.push(`${timestamp(4.5 - i * 0.1)},203.0.113.50,${host},smb,warn,SMB connection attempt from unauthorized IP`);
      }
      
      // File encryption
      logs.push(`${timestamp(3)},203.0.113.50,file-server-01,auditd,critical,Bulk file modification detected: 5000+ files encrypted in /shared`);
      logs.push(`${timestamp(2.8)},203.0.113.50,backup-server,auditd,critical,Backup deletion attempt: shadow_copy_delete.exe`);
      logs.push(`${timestamp(2.5)},203.0.113.50,file-server-01,nginx,critical,Ransom note deployed: README_ENCRYPTED.txt`);
      logs.push(`${timestamp(2)},203.0.113.50,web-01,auditd,critical,Process terminated: encryptor.exe (exit code 0)`);
      
      return logs;
    }
  },

  lateral_movement: {
    id: 'lateral_movement',
    name: 'Lateral Movement via RDP',
    description: 'Remote desktop protocol abuse for internal network traversal',
    expectedMitre: ['T1021.001', 'T1566', 'T1078'],
    expectedHitl: true,
    generateLogs: () => {
      const logs: string[] = [];
      const internalHosts = ['workstation-001', 'workstation-002', 'workstation-003', 'dc-01', 'file-server'];
      
      // Phishing email delivery
      logs.push(`${timestamp(5)},external,mail-server,smtp,info,Email received from attacker@malicious.com`);
      logs.push(`${timestamp(4.9)},external,mail-server,spam,warn,Suspicious attachment: invoice.docm`);
      
      // Initial compromise
      logs.push(`${timestamp(4.5)},192.168.1.50,workstation-001,av,warn,Trojan detected: AgentTesla`);
      logs.push(`${timestamp(4.3)},192.168.1.50,workstation-001,auditd,credential,Credential harvesting: lsass.exe dump`);
      
      // Lateral movement via RDP
      for (let i = 0; i < 20; i++) {
        const host = internalHosts[i % internalHosts.length];
        logs.push(`${timestamp(4 - i * 0.15)},192.168.1.50,${host},rdp,warn,RDP connection attempt from workstation-001`);
      }
      
      logs.push(`${timestamp(1.5)},192.168.1.50,dc-01,auditd,critical,Privilege escalation: Domain Admin account created`);
      logs.push(`${timestamp(1)},192.168.1.50,dc-01,auditd,critical,Golden ticket creation detected: krbtgt`);
      
      return logs;
    }
  },

  web_shell: {
    id: 'web_shell',
    name: 'Web Shell Deployment',
    description: 'Backdoor web shell installation for persistent access',
    expectedMitre: ['T1505', 'T1190', 'T1059'],
    expectedHitl: true,
    generateLogs: () => {
      const logs: string[] = [];
      
      // Exploit attempt
      logs.push(`${timestamp(5)},203.0.113.75,web-01,nginx,warn,Unusual HTTP request: /cgi-bin/..%2F..%2F..%2Fetc/passwd`);
      logs.push(`${timestamp(4.8)},203.0.113.75,web-01,waf,error,Path traversal attempt blocked`);
      logs.push(`${timestamp(4.5)},203.0.113.75,web-01,nginx,error,HTTP 500: /uploads/shell.php`);
      
      // Web shell upload
      logs.push(`${timestamp(4)},203.0.113.75,web-01,auditd,critical,File created: /var/www/html/uploads/cmd.php`);
      logs.push(`${timestamp(3.8)},203.0.113.75,web-01,nginx,warn,Suspicious POST to /uploads/cmd.php with cmd parameter`);
      
      // Command execution
      const commands = ['whoami', 'id', 'uname -a', 'cat /etc/passwd', 'ps aux', 'netstat -tulpn'];
      for (let i = 0; i < commands.length; i++) {
        logs.push(`${timestamp(3.5 - i * 0.3)},203.0.113.75,web-01,auditd,warn,Command execution via web shell: ${commands[i]}`);
      }
      
      logs.push(`${timestamp(2)},203.0.113.75,web-01,auditd,critical,Reverse shell spawned: connection to 203.0.113.75:4444`);
      logs.push(`${timestamp(1.5)},203.0.113.75,web-01,firewall,critical,Outbound connection to known C2 server`);
      
      return logs;
    }
  },

  dns_tunneling: {
    id: 'dns_tunneling',
    name: 'DNS Tunneling',
    description: 'Data exfiltration via DNS queries to bypass firewall restrictions',
    expectedMitre: ['T1071.004', 'T1048', 'T1567'],
    expectedHitl: false,
    generateLogs: () => {
      const logs: string[] = [];
      const domains = ['exfil.attacker.com', 'c2.malicious.net', 'tunnel.bad.org'];
      
      // Normal DNS queries
      for (let i = 0; i < 10; i++) {
        logs.push(`${timestamp(5 - i * 0.1)},192.168.1.100,dns-server,dns,info,Query: www.google.com`);
      }
      
      // Suspicious DNS tunneling
      for (let i = 0; i < 50; i++) {
        const domain = domains[i % domains.length];
        const subdomain = `data${i.toString(36)}`;
        logs.push(`${timestamp(4 - i * 0.05)},192.168.1.100,dns-server,dns,warn,Long DNS query: ${subdomain}.${domain} (length: ${50 + i})`);
      }
      
      logs.push(`${timestamp(1)},192.168.1.100,dns-server,dns,critical,DNS tunneling detected: high volume of subdomain queries to single domain`);
      logs.push(`${timestamp(0.5)},192.168.1.100,firewall,critical,Data exfiltration via DNS: 2MB transferred in 60s`);
      
      return logs;
    }
  },

  privilege_escalation: {
    id: 'privilege_escalation',
    name: 'Privilege Escalation',
    description: 'Kernel vulnerability exploitation for root access',
    expectedMitre: ['T1068', 'T1190', 'T1065'],
    expectedHitl: true,
    generateLogs: () => {
      const logs: string[] = [];
      
      // Vulnerability scanning
      logs.push(`${timestamp(5)},192.168.1.200,web-01,nginx,warn,User agent: Nikto/2.1.6`);
      logs.push(`${timestamp(4.8)},192.168.1.200,web-01,waf,warn,Directory traversal attempt: /etc/passwd`);
      
      // Exploit attempt
      logs.push(`${timestamp(4.5)},192.168.1.200,web-01,nginx,error,HTTP 404: /cgi-bin/exploit.cgi`);
      logs.push(`${timestamp(4.3)},192.168.1.200,web-01,auditd,warn,Suspicious process: /tmp/.exploit`);
      
      // Privilege escalation
      logs.push(`${timestamp(4)},192.168.1.200,web-01,auditd,critical,SUID binary modification: /bin/bash`);
      logs.push(`${timestamp(3.8)},192.168.1.200,web-01,auditd,critical,Kernel module loaded: rootkit.ko`);
      logs.push(`${timestamp(3.5)},192.168.1.200,web-01,auditd,critical,Root shell spawned: UID 0, GID 0`);
      
      // Persistence
      logs.push(`${timestamp(3)},192.168.1.200,web-01,auditd,warn,Cron job added: @reboot /tmp/.backdoor`);
      logs.push(`${timestamp(2.5)},192.168.1.200,web-01,auditd,warn,SSH key added to authorized_keys`);
      
      return logs;
    }
  },

  supply_chain: {
    id: 'supply_chain',
    name: 'Supply Chain Compromise',
    description: 'Malicious dependency injection in package manager',
    expectedMitre: ['T1195', 'T1195.01', 'T1055'],
    expectedHitl: true,
    generateLogs: () => {
      const logs: string[] = [];
      
      // Package installation
      logs.push(`${timestamp(5)},localhost,build-server,npm,info,Installing package: malicious-utils@2.0.0`);
      logs.push(`${timestamp(4.8)},localhost,build-server,npm,warn,Package from unverified registry`);
      
      // Malicious execution
      logs.push(`${timestamp(4.5)},localhost,build-server,auditd,critical,Post-install script executed: node index.js`);
      logs.push(`${timestamp(4.3)},localhost,build-server,auditd,warn,Network connection to exfil.attacker.com:443`);
      
      // Data exfiltration
      logs.push(`${timestamp(4)},localhost,build-server,auditd,critical,Environment variables read: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY`);
      logs.push(`${timestamp(3.8)},localhost,build-server,auditd,credential,Credential dump: ~/.aws/credentials`);
      
      // Lateral movement to production
      logs.push(`${timestamp(3.5)},localhost,build-server,git,warn,Push to production with malicious commit`);
      logs.push(`${timestamp(3)},192.168.1.150,prod-web-01,auditd,critical,Malicious code deployed: backdoor.js`);
      logs.push(`${timestamp(2.5)},192.168.1.150,prod-web-01,nginx,critical,Reverse shell connection established`);
      
      return logs;
    }
  },

  default: {
    id: 'default',
    name: 'Default Demo Scenario',
    description: 'Mixed credential stuffing, port scan, and SQLi with data exfiltration',
    expectedMitre: ['T1110.004', 'T1046', 'T1190'],
    expectedHitl: true,
    generateLogs: () => [
      '2026-07-04T12:00:01.000Z,192.168.1.105,api-gw-01,sshd,info,Failed password for invalid user admin',
      '2026-07-04T12:00:05.000Z,192.168.1.105,api-gw-01,sshd,info,Failed password for invalid user admin',
      '2026-07-04T12:01:10.000Z,192.168.1.105,api-gw-01,nginx,warn,PORT_SCAN signature detected from source IP 192.168.1.105',
      '2026-07-04T12:02:15.000Z,192.168.1.105,api-gw-01,sshd,info,Failed password for invalid user db_admin',
      '2026-07-04T12:03:20.000Z,192.168.1.105,api-gw-01,sshd,info,Failed password for invalid user db_admin',
      '2026-07-04T12:04:30.000Z,192.168.1.105,api-gw-01,nginx,error,SQL_INJECTION attempt detected on parameter id',
      '2026-07-04T12:05:00.000Z,192.168.1.105,db-prod-02,mysqld,critical,Privilege escalation: root shell spawned by mysql user',
      '2026-07-04T12:06:00.000Z,192.168.1.105,db-prod-02,auditd,critical,DATA_EXFIL of customer records to 192.168.1.105',
    ]
  }
};

export const DEMO_LOGS = SCENARIOS.default.generateLogs();
export const DEMO_INCIDENT_ID = 'INC-2026-DEMO-001';
