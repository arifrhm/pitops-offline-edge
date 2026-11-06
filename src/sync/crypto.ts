const HMAC_SECRET = 'PITOPS_MINING_EDGE_SECRET_KEY_2026';

export async function signRecordBrowser(record: {
  id: string;
  unit_code: string;
  shift: string;
  inspector_id: string;
  hour_meter: number;
  client_timestamp: string;
}): Promise<string> {
  const canonicalString = [
    record.id,
    record.unit_code,
    record.shift,
    record.inspector_id,
    record.hour_meter,
    record.client_timestamp
  ].join('|');

  const encoder = new TextEncoder();
  const keyData = encoder.encode(HMAC_SECRET);
  const messageData = encoder.encode(canonicalString);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
