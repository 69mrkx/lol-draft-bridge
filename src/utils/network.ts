import os from 'node:os';

/**
 * Returns a list of local IPv4 network addresses (ignoring loopback 127.0.0.1)
 */
export function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (!netList) continue;

    for (const net of netList) {
      // Skip over non-IPv4 and internal/loopback addresses
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  return addresses.length > 0 ? addresses : ['127.0.0.1'];
}

export function getPrimaryLocalIp(): string {
  const ips = getLocalIpAddresses();
  // Prefer common private network prefixes 192.168.x.x, 10.x.x.x, 172.16-31.x.x
  const privateIp = ips.find(
    (ip) =>
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
  );
  return privateIp || ips[0] || '127.0.0.1';
}
