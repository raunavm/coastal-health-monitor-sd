import * as ort from 'onnxruntime-node';

// Initialize ONNX Runtime for WebAssembly
// We need to point to the wasm files. In Next.js, these are usually served from public/
// However, onnxruntime-web tries to find them automatically.
// We might need to configure the path if it fails.

const MODEL_PATH = '/models/beach-risk-v5.onnx';

// Feature definitions matching Python
const GEOMS = ["IB", "COR", "PL", "LJS", "MB", "OB"];

export interface InferenceInput {
    geomId: string;
    rainfall: number; // 72h mm
    wind: number;     // m/s
    tides: number;    // -1..1
    waves: number;    // m
    sst: number;      // C
    community: number;// 0..1

    // Optional temporal overrides
    hour?: number;
    month?: number;
    rain_trend?: number;
    timestamp?: number; // Epoch ms for target time

    // Optional center for grid generation
    lat?: number;
    lng?: number;
}

export interface RiskCell {
    lat: number;
    lon: number;
    riskClass: 'low' | 'medium' | 'high';
    riskScore: number;
    uncertainty: number;
}

export interface InferenceResult {
    cells: RiskCell[];
    aggregate: {
        riskScore: number;
        riskClass: 'low' | 'medium' | 'high';
        physicsBase: number;
        residual: number;
    };
    meta: {
        model_version: string;
        onnx: boolean;
        when: string;
    };
}

// Helper: Geom to Index
function getGeomIdx(g: string): number {
    const idx = GEOMS.indexOf(g);
    return idx === -1 ? 0 : idx / Math.max(1, GEOMS.length - 1);
}

// Helper: Physics Score
function getPhysicsScore(rain: number, wind: number, tide: number, comm: number): number {
    const r = Math.min(Math.max(rain / 50.0, 0), 1);
    const w = Math.min(Math.max(wind / 20.0, 0), 1);
    const t = Math.min(Math.max(Math.abs(tide) / 2.0, 0), 1);
    const c = Math.min(Math.max(comm, 0), 1);

    return 0.4 * r + 0.3 * w + 0.2 * t + 0.1 * c;
}

// Helper: Score to Class
function scoreToClass(y: number): 'low' | 'medium' | 'high' {
    if (y < 0.33) return 'low';
    if (y < 0.66) return 'medium';
    return 'high';
}

// Helper: Get Center
function getCenter(lat?: number, lng?: number): [number, number] {
    if (lat === undefined || lng === undefined) {
        return [32.56, -117.15];
    }
    return [lat, lng];
}

// Global session cache
let session: ort.InferenceSession | null = null;

async function getSession(): Promise<ort.InferenceSession> {
    if (session) return session;

    try {
        // In serverless/Node environment, we might need to load from filesystem
        // But onnxruntime-web is designed for browser. 
        // For Next.js API routes (Node.js), we should technically use onnxruntime-node.
        // However, to keep it "universal" or if we want to run in Edge, web is safer.
        // Let's assume standard Node.js API route for now.
        // If running in Node, we need to load file from disk.

        // Check if we are in browser or node
        const isNode = typeof window === 'undefined';

        if (isNode) {
            // In Node, we need absolute path
            const fs = await import('fs');
            const path = await import('path');
            const modelPath = path.join(process.cwd(), 'public', 'models', 'beach-risk-v5.onnx');
            const modelBuffer = fs.readFileSync(modelPath);
            session = await ort.InferenceSession.create(modelBuffer);
        } else {
            // In browser
            session = await ort.InferenceSession.create(MODEL_PATH);
        }

        return session;
    } catch (e) {
        console.error("Failed to load ONNX model:", e);
        throw e;
    }
}

// Main Predict Function
export async function predictRisk(input: InferenceInput): Promise<InferenceResult> {
    // 1. Prepare Features
    const now = new Date();
    const targetDate = input.timestamp ? new Date(input.timestamp) : now;

    const hour = input.hour ?? targetDate.getHours();
    const month = input.month ?? (targetDate.getMonth() + 1);
    const isWeekend = (targetDate.getDay() === 0 || targetDate.getDay() === 6) ? 1 : 0;
    const rainTrend = input.rain_trend ?? 1.0;

    const hourSin = Math.sin(2 * Math.PI * hour / 24);
    const hourCos = Math.cos(2 * Math.PI * hour / 24);
    const monthSin = Math.sin(2 * Math.PI * (month - 1) / 12);
    const monthCos = Math.cos(2 * Math.PI * (month - 1) / 12);
    const geomIdx = getGeomIdx(input.geomId);

    // Calculate Physics Base (Always available)
    const base = getPhysicsScore(input.rainfall, input.wind, input.tides, input.community);

    let residual = 0;
    let onnxSuccess = false;

    try {
        const sess = await getSession();

        const features = new Float32Array([
            input.rainfall,
            input.wind,
            input.tides,
            input.waves,
            input.sst,
            input.community,
            hourSin,
            hourCos,
            monthSin,
            monthCos,
            isWeekend,
            rainTrend,
            geomIdx
        ]);

        const tensor = new ort.Tensor('float32', features, [1, 13]);
        const feeds = { x: tensor };
        const results = await sess.run(feeds);

        const outputName = sess.outputNames[0];
        const outputTensor = results[outputName];
        residual = Number(outputTensor.data[0]);
        onnxSuccess = true;
    } catch (e) {
        console.error("ONNX Inference failed, using physics fallback:", e);
        // Fallback: residual = 0 (pure physics)
        residual = 0;
    }

    // 3. Combine
    const riskScore = Math.min(Math.max(base + residual, 0), 1);

    // 4. Generate Grid
    const [lat0, lng0] = getCenter(input.lat, input.lng);
    const cells: RiskCell[] = [];

    for (let iy = 0; iy < 8; iy++) {
        for (let ix = 0; ix < 8; ix++) {
            const dlat = (iy - 3.5) * 0.01;
            const dlng = (ix - 3.5) * 0.01;

            const seed = (ix * 100 + iy) + input.geomId.charCodeAt(0);
            const jitter = ((Math.sin(seed) * 10000) % 1000) / 1000.0;

            const localScore = Math.min(Math.max(riskScore + (jitter - 0.5) * 0.08, 0), 1);

            cells.push({
                lon: Number((lng0 + dlng).toFixed(3)),
                lat: Number((lat0 + dlat).toFixed(3)),
                riskClass: scoreToClass(localScore),
                riskScore: Number(localScore.toFixed(3)),
                uncertainty: Number((0.15 + (1 - Math.abs(0.5 - localScore)) * 0.15).toFixed(2))
            });
        }
    }

    return {
        cells,
        aggregate: {
            riskScore: Number(riskScore.toFixed(3)),
            riskClass: scoreToClass(riskScore),
            physicsBase: Number(base.toFixed(3)),
            residual: Number(residual.toFixed(3))
        },
        meta: {
            model_version: onnxSuccess ? "v5_ensemble_js" : "v5_physics_fallback",
            onnx: onnxSuccess,
            when: new Date().toISOString()
        }
    };
}
