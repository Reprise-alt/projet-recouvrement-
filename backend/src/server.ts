import 'dotenv/config';
import { createApp } from './app';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
createApp().listen(port, () => {
  console.log(`Recouvrement API listening on port ${port}`);
});
