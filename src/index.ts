import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import scriptsRouter from './routes/scripts';
import userRouter from './routes/user';
import uploadRouter from './routes/upload';
import googleDriveRouter from './routes/googleDrive';

const app = express();
const PORT = process.env.PORT ?? 3100;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/scripts', scriptsRouter);
app.use('/api/user', userRouter);
app.use('/api/scripts/upload', uploadRouter);
app.use('/api/google-drive', googleDriveRouter);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Rehearse API running on http://localhost:${PORT}`);
});
