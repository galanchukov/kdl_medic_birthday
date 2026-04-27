// server/src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Эндпоинты ---

// Получить всех врачей
app.get('/api/doctors', async (req, res) => {
  try {
    const doctors = await prisma.doctor.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(doctors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Добавить врача (Защищено в будущем)
app.post('/api/doctors', async (req, res) => {
  try {
    const doctor = await prisma.doctor.create({
      data: req.body
    });
    res.json(doctor);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creating doctor' });
  }
});

// Удалить врача
app.delete('/api/doctors/:id', async (req, res) => {
  try {
    await prisma.doctor.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting doctor' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
});
