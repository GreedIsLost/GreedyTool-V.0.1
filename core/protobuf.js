const protobuf = require('protobufjs');

const PROTO_DEF = `
syntax = "proto2";
package steam;

message ContentManifestPayload {
  message FileMapping {
    optional string filename = 1;
    optional uint64 size = 2;
    optional uint32 flags = 3;
    optional uint64 sha_filename = 4;
    optional uint64 sha_content = 5;
    repeated uint32 chunk_offsets = 6;
  }
  message DirectoryMapping {
    optional string dirname = 1;
    optional uint64 sha_dirname = 2;
  }
  repeated FileMapping files = 1;
  repeated DirectoryMapping directories = 2;
  optional uint64 creation_time = 3;
  optional uint32 unknown4 = 4;
  optional uint32 unknown5 = 5;
  optional uint32 unknown6 = 6;
}
`;

let rootCache = null;

async function getRoot() {
  if (rootCache) return rootCache;
  rootCache = protobuf.parse(PROTO_DEF).root;
  return rootCache;
}

async function decodeManifest(buffer) {
  try {
    const root = await getRoot();
    const Message = root.lookupType('steam.ContentManifestPayload');
    const decoded = Message.decode(buffer);
    const obj = Message.toObject(decoded, {
      longs: Number,
      enums: String,
      defaults: true,
      arrays: true,
    });
    return obj;
  } catch (err) {
    return { error: err.message, files: [], directories: [] };
  }
}

function formatManifestSummary(decoded) {
  if (!decoded || decoded.error) {
    return { totalFiles: 0, totalSize: 0, files: [], error: decoded?.error };
  }
  const files = (decoded.files || []).map(f => ({
    name: f.filename || 'unknown',
    size: f.size || 0,
    flags: f.flags || 0,
  }));
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const totalFiles = files.length;
  return { totalFiles, totalSize, files, directories: (decoded.directories || []).length };
}

module.exports = { decodeManifest, formatManifestSummary };
