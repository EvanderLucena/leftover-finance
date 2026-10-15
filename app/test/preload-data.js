// Congela o "hoje" do servidor de teste. Carregado com `node --require ./test/preload-data.js server.js`
// quando FAKE_NOW (data ISO) estiver definida. Não é usado em produção.
const fixo = process.env.FAKE_NOW ? new Date(process.env.FAKE_NOW).getTime() : null;

if (fixo !== null) {
  const DataReal = Date;
  class DataFixa extends DataReal {
    constructor(...args) {
      if (args.length === 0) super(fixo);
      else super(...args);
    }
    static now() { return fixo; }
  }
  global.Date = DataFixa;
}
