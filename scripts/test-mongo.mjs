import dns from 'node:dns';
import { MongoClient } from 'mongodb';

// Alguns provedores de internet/roteadores locais bloqueiam ou falham consultas DNS SRV no Windows.
// Definir servidores DNS públicos garante resolução limpa para mongodb+srv://
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function testMongo() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'owlbear';

  console.log('Iniciando teste de conexão com o MongoDB Atlas...');
  console.log('URI mascarada:', uri ? uri.replace(/:([^:@]+)@/, ':****@') : 'NÃO ENCONTRADA');
  console.log('Banco de dados alvo:', dbName);

  if (!uri) {
    throw new Error('MONGODB_URI não encontrada no arquivo .env');
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  const start = Date.now();

  try {
    await client.connect();
    const elapsed = Date.now() - start;
    console.log(`[OK] Conectado com sucesso em ${elapsed}ms.`);

    const db = client.db(dbName);

    // 1. Ping
    const pingResult = await db.command({ ping: 1 });
    console.log('[OK] Ping respondido pelo cluster:', JSON.stringify(pingResult));

    // 2. Acesso à coleção room_sheets
    const collection = db.collection('room_sheets');
    const count = await collection.countDocuments();
    console.log(`[OK] Coleção "room_sheets" acessível. Documentos atuais: ${count}`);

    // 3. Teste de gravação (upsert)
    const testDoc = {
      _id: '__connection_probe__',
      roomId: 'test-room',
      sheetId: 'test-probe',
      testedAt: new Date()
    };
    await collection.replaceOne({ _id: testDoc._id }, testDoc, { upsert: true });
    console.log('[OK] Permissão de ESCRITA confirmada (documento de teste gravado).');

    // 4. Teste de leitura
    const found = await collection.findOne({ _id: testDoc._id });
    if (!found || found.roomId !== 'test-room') {
      throw new Error('Falha na validação de leitura do documento de teste');
    }
    console.log('[OK] Permissão de LEITURA confirmada.');

    // 5. Teste de exclusão
    await collection.deleteOne({ _id: testDoc._id });
    console.log('[OK] Permissão de EXCLUSÃO confirmada (limpeza finalizada).');

    console.log('\n======================================================');
    console.log('STATUS: Conexão e permissões com o MongoDB 100% OK!');
    console.log('======================================================');
  } catch (err) {
    console.error('\n[FALHA] Erro na conexão:', err.message);
    if (err.cause) console.error('Causa:', err.cause);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

testMongo();
