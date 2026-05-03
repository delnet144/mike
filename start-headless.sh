#!/bin/bash
# Start Mike backend and frontend in single-player local-only mode.
# Run from ~/mike/ after installing dependencies:
#   cd backend && npm install
#   cd ../frontend && npm install --legacy-peer-deps

set -e

cd "$(dirname "$0")"

echo "Mike single-player mode"
echo "Backend database:  $(pwd)/backend/data/mike.sqlite"
echo "Local storage:     $(pwd)/backend/data/storage/"
echo ""

echo "Starting backend on 0.0.0.0:3001..."
nohup bash -c 'cd backend && npm run dev' > backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

echo "Starting frontend on 0.0.0.0:3000..."
nohup bash -c 'cd frontend && npm run dev:host' > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "Mike is running headlessly."
echo "Backend logs: $(pwd)/backend.log"
echo "Frontend logs: $(pwd)/frontend.log"
echo ""
echo "Open: http://192.168.2.204:3000"
echo ""
echo "To stop: kill $BACKEND_PID $FRONTEND_PID"
