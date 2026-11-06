export async function compressGzip(text: string): Promise<{ buffer: Uint8Array; isCompressed: boolean }> {
  if (typeof CompressionStream === 'undefined') {
    return {
      buffer: new TextEncoder().encode(text),
      isCompressed: false
    };
  }

  const stream = new Blob([text]).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
  const response = new Response(compressedStream);
  const buffer = await response.arrayBuffer();

  return {
    buffer: new Uint8Array(buffer),
    isCompressed: true
  };
}
