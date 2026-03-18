FROM node:22-slim

RUN apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && \
    npm cache clean --force && \
    # Prune heavy onnxruntime-node binaries (saves ~500MB) \
    rm -rf node_modules/onnxruntime-node/bin/napi-v3/darwin \
           node_modules/onnxruntime-node/bin/napi-v3/win32 \
           node_modules/onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node_cuda.so \
           node_modules/onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node_tensorrt.so

COPY index.js ./
COPY src/ ./src/

# IMAGE_MCP_AUTH_TOKEN must be provided at runtime via docker run -e
ENV IMAGE_MCP_PORT="3000"
ENV IMAGE_MCP_MAX_SIZE_MB="50"
ENV IMAGE_MCP_BASE_URL=""
ENV IMAGE_MCP_TEMP_DIR="/tmp/image-mcp"
ENV IMAGE_MCP_TEMP_MAX_AGE_HOURS="24"

EXPOSE 3000

CMD ["node", "index.js"]
