
const APP = {
  data: null,
  state: {
    step: 'overview',
    mode: 'aprender',
    studentName: '',
    studentClass: '',
    inputs: {},
    commission: {},
    apr: {},
    completed: {}
  },
  steps: [
    ['overview','Visão Geral'],
    ['dados','Dados da Prova'],
    ['sp1','Situação 01'],
    ['memorial','Memorial Descritivo'],
    ['parecer','Parecer Técnico'],
    ['diagrama1','Diagrama Unifilar'],
    ['sp2','Situação 02'],
    ['sp3','Situação 03'],
    ['apr','APR'],
    ['bancada','Bancada SENAI'],
    ['transcricao','Folha de Transcrição'],
    ['validacao','Validação Final']
  ]
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = (v,d=2) => new Intl.NumberFormat('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(v);
const money = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);

async function init(){
  APP.data = await fetch('data/saep-data.json').then(r=>r.json());
  loadState();
  seedInputs();
  buildNav();
  bindShell();
  render();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
}

function seedInputs(){
  const p=APP.data.prova1, s=p.sfcr;
  const defaults={
    consumoMensal:p.contexto.consumoMensal_kWh,
    tempAmb:p.contexto.temperaturaAmbiente,
    aguaDemanda:p.contexto.aguaDemanda_L_dia,
    tempConsumo:p.contexto.temperaturaConsumo_C,
    tempArmazenamento:p.contexto.temperaturaArmazenamento_C,
    hsp:s.hspPadrao, fc:s.fatorCorrecaoLesteOeste11,
    perdas:Object.values(s.perdas).reduce((a,b)=>a+b,0),
    custoSfcr:s.custo_R_Wp, custoSas:p.sas.custo_R_L,
    moduloWp:s.moduloProva.potencia_Wp
  };
  for(const [k,v] of Object.entries(defaults)) if(APP.state.inputs[k]===undefined) APP.state.inputs[k]=v;
}

function loadState(){
  try{
    const raw=localStorage.getItem('saep-renovaveis-v1');
    if(raw) APP.state={...APP.state,...JSON.parse(raw)};
  }catch(e){}
}
function saveState(){localStorage.setItem('saep-renovaveis-v1',JSON.stringify(APP.state));}
function buildNav(){
  const nav=$('#navSteps'); nav.innerHTML='';
  APP.steps.forEach(([id,label],i)=>{
    const b=document.createElement('button'); b.className='nav-step'; b.dataset.step=id;
    b.innerHTML=`<span class="num">${i+1}</span><span>${label}</span>`;
    b.addEventListener('click',()=>{APP.state.step=id;saveState();render()});
    nav.appendChild(b);
  });
}
function bindShell(){
  $('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  $('#modeSelect').value=APP.state.mode;
  $('#modeSelect').addEventListener('change',e=>{APP.state.mode=e.target.value;saveState();render()});
  $('#studentName').value=APP.state.studentName||'';
  $('#studentClass').value=APP.state.studentClass||'';
  $('#studentName').addEventListener('input',e=>{APP.state.studentName=e.target.value;saveState()});
  $('#studentClass').addEventListener('input',e=>{APP.state.studentClass=e.target.value;saveState()});
  $('#btnPrint').addEventListener('click',()=>window.print());
  $('#btnReset').addEventListener('click',()=>{if(confirm('Apagar o progresso salvo neste dispositivo?')){localStorage.removeItem('saep-renovaveis-v1');location.reload()}});
  $('#btnExport').addEventListener('click',exportJSON);
  $('#fileImport').addEventListener('change',importJSON);
}
function markComplete(id,v=true){APP.state.completed[id]=v;saveState();updateNav()}
function updateNav(){
  $$('.nav-step').forEach(b=>{
    b.classList.toggle('active',b.dataset.step===APP.state.step);
    b.classList.toggle('done',!!APP.state.completed[b.dataset.step]);
  });
}

function calc(){
  const x=APP.state.inputs, d=APP.data.prova1;
  const volumeArm = x.aguaDemanda * (x.tempConsumo-x.tempAmb)/(x.tempArmazenamento-x.tempAmb);
  const energiaUtil = volumeArm*d.sas.densidadeAgua_kg_L*d.sas.calorEspecifico_kJ_kgC*(x.tempArmazenamento-x.tempAmb)/3600*30;
  const pr=1-x.perdas/100;
  const hspCorr=x.hsp*x.fc;
  const p1=x.consumoMensal/(30*hspCorr*pr);
  const eResidual=Math.max(0,x.consumoMensal-energiaUtil);
  const p2=eResidual/(30*hspCorr*pr);
  const invSAS=volumeArm*x.custoSas;
  const inv1=p1*1000*x.custoSfcr;
  const inv2sfcr=p2*1000*x.custoSfcr;
  const inv2=inv2sfcr+invSAS;
  const nmods=Math.ceil((p2*1000)/x.moduloWp);
  const mod=APP.data.prova1.sfcr.moduloProva;
  const area=nmods*mod.largura_m*mod.altura_m;
  const pInst=nmods*x.moduloWp/1000;
  const invRef=APP.data.prova1.sfcr.referenciaGabarito.inversor_kW;
  const ib=invRef*1000/(Math.sqrt(3)*220);
  return {volumeArm,energiaUtil,pr,hspCorr,p1,eResidual,p2,invSAS,inv1,inv2sfcr,inv2,nmods,area,pInst,ib,recomendado:inv2<inv1?'Cenário II — SFCR + SAS':'Cenário I — SFCR'};
}

function render(){
  updateNav();
  const step=APP.state.step;
  $('#pageTitle').textContent=APP.steps.find(x=>x[0]===step)?.[1]||'';
  const content=$('#content'); content.innerHTML='';
  const tpl=$(`#tpl-${step}`);
  if(!tpl){content.innerHTML='<div class="panel">Etapa não encontrada.</div>';return}
  content.appendChild(tpl.content.cloneNode(true));
  const fn=renderers[step]; if(fn) fn();
  $('#sidebar').classList.remove('open');
}

const renderers={
  overview(){
    const c=calc();
    const done=Object.values(APP.state.completed).filter(Boolean).length, total=APP.steps.length;
    $('#progressPct').textContent=Math.round(done/total*100)+'%';
    $('#progressText').textContent=`${done} de ${total} etapas concluídas`;
    $('.progress-ring').style.background=`conic-gradient(var(--orange) ${done/total*100}%, #e8edf3 0)`;
    $('#overviewCards').innerHTML=`
      <div class="card"><h4>Situação 01</h4><p>Projeto e comparação dos cenários.</p><div class="metric">${fmt(c.p2,2)} kWp</div></div>
      <div class="card"><h4>Situação 02</h4><p>Sistema híbrido e comissionamento.</p><div class="metric">7 ensaios</div></div>
      <div class="card"><h4>Situação 03</h4><p>Diagnóstico da bancada.</p><div class="metric">3 defeitos</div></div>`;
    markComplete('overview');
  },
  dados(){
    $$('[data-field]').forEach(el=>{
      const k=el.dataset.field; el.value=APP.state.inputs[k];
      el.addEventListener('input',()=>{APP.state.inputs[k]=Number(el.value);saveState()});
    });
    markComplete('dados');
  },
  sp1(){
    const c=calc();
    $('#sp1Summary').innerHTML=`
      <div class="card"><h4>Cenário I</h4><p>Somente SFCR</p><div class="metric">${fmt(c.p1,2)} kWp</div><p>${money(c.inv1)}</p></div>
      <div class="card"><h4>Cenário II</h4><p>SFCR + SAS</p><div class="metric">${fmt(c.p2,2)} kWp</div><p>${money(c.inv2)}</p></div>
      <div class="card"><h4>Recomendação</h4><p>Menor investimento inicial</p><div class="metric">${c.recomendado}</div></div>`;
    const items=[
      ['1. Volume de armazenamento do SAS',
       `Varm = Vcons × (Tcons − Tamb) / (Tarm − Tamb)\nVarm = ${fmt(APP.state.inputs.aguaDemanda,0)} × (${fmt(APP.state.inputs.tempConsumo,0)} − ${fmt(APP.state.inputs.tempAmb,0)}) / (${fmt(APP.state.inputs.tempArmazenamento,0)} − ${fmt(APP.state.inputs.tempAmb,0)})\nVarm = ${fmt(c.volumeArm,2)} L`,
       `Volume de armazenamento do SAS: ${fmt(c.volumeArm,2)} L.`],
      ['2. Investimento inicial no SAS',
       `I_SAS = Varm × custo por litro\nI_SAS = ${fmt(c.volumeArm,2)} × ${money(APP.state.inputs.custoSas)}\nI_SAS = ${money(c.invSAS)}`,
       `Investimento inicial do SAS: ${money(c.invSAS)}.`],
      ['3. Energia útil mensal do SAS',
       `Eutil = m × c × ΔT × 30 / 3600\nEutil = ${fmt(c.volumeArm,2)} × 4,18 × (${fmt(APP.state.inputs.tempArmazenamento,0)} − ${fmt(APP.state.inputs.tempAmb,0)}) × 30 / 3600\nEutil = ${fmt(c.energiaUtil,2)} kWh/mês`,
       `Energia útil demandada pelo SAS: ${fmt(c.energiaUtil,2)} kWh/mês.`],
      ['4. Potência FV — Cenário I',
       `HSPcorr = ${fmt(APP.state.inputs.hsp,4)} × ${fmt(APP.state.inputs.fc,3)} = ${fmt(c.hspCorr,4)} h/dia\nPR = 1 − ${fmt(APP.state.inputs.perdas,1)}% = ${fmt(c.pr,3)}\nPFV = ${fmt(APP.state.inputs.consumoMensal,2)} / (30 × ${fmt(c.hspCorr,4)} × ${fmt(c.pr,3)})\nPFV = ${fmt(c.p1,2)} kWp`,
       `Potência do arranjo fotovoltaico no Cenário I: ${fmt(c.p1,2)} kWp.`],
      ['5. Investimento SFCR — Cenário I',
       `I = PFV × 1000 × R$/Wp\nI = ${fmt(c.p1,2)} × 1000 × ${money(APP.state.inputs.custoSfcr)}\nI = ${money(c.inv1)}`,
       `Investimento do Cenário I: ${money(c.inv1)}.`],
      ['6. Potência FV — Cenário II',
       `Eres = ${fmt(APP.state.inputs.consumoMensal,2)} − ${fmt(c.energiaUtil,2)} = ${fmt(c.eResidual,2)} kWh/mês\nPFV = ${fmt(c.eResidual,2)} / (30 × ${fmt(c.hspCorr,4)} × ${fmt(c.pr,3)})\nPFV = ${fmt(c.p2,2)} kWp`,
       `Potência do arranjo fotovoltaico no Cenário II: ${fmt(c.p2,2)} kWp.`],
      ['7. Investimento SFCR — Cenário II',
       `I_SFCR = ${fmt(c.p2,2)} × 1000 × ${money(APP.state.inputs.custoSfcr)} = ${money(c.inv2sfcr)}\nI_TOTAL = ${money(c.inv2sfcr)} + ${money(c.invSAS)} = ${money(c.inv2)}`,
       `Investimento total do Cenário II: ${money(c.inv2)}.`],
      ['8. Comparação dos cenários',
       `Cenário I = ${money(c.inv1)}\nCenário II = ${money(c.inv2)}\nDiferença = ${money(Math.abs(c.inv1-c.inv2))}`,
       `Recomenda-se ${c.recomendado}, por apresentar menor investimento inicial.`],
      ['9. Quantidade de módulos e área',
       `N = teto(${fmt(c.p2*1000,0)} / ${fmt(APP.state.inputs.moduloWp,0)}) = ${c.nmods} módulos\nÁrea ≈ ${c.nmods} × 2,278 × 1,134 = ${fmt(c.area,2)} m²\nDistribuição de referência: 16 módulos em cada água.`,
       `${c.nmods} módulos de ${fmt(APP.state.inputs.moduloWp,0)} Wp, distribuídos em duas águas, com área aproximada de ${fmt(c.area,2)} m².`],
      ['10. Inversor, corrente, cabo e proteção',
       `Referência do gabarito: inversor 15 kW, trifásico, 2 MPPTs.\nIb = P / (√3 × V)\nIb = 15000 / (1,732 × 220) = ${fmt(c.ib,2)} A\nSeção CA = 16 mm²\nDisjuntor = 50 A`,
       `Inversor de 15 kW, trifásico, mínimo 2 MPPTs; corrente de projeto ${fmt(c.ib,2)} A; condutor CA 16 mm²; disjuntor 50 A.`]
    ];
    $('#calcSteps').innerHTML=items.map((it,i)=>calcCard(it[0],it[1],it[2],i)).join('');
    bindReveal();
    $('#calcAllBtn').addEventListener('click',()=>{APP.state.mode='resolver';$('#modeSelect').value='resolver';saveState();render()});
    markComplete('sp1');
  },
  memorial(){
    const c=calc();
    $('#memorialText').innerHTML=`
      <p><strong>Caracterização da unidade consumidora:</strong> hotel de pequeno porte em Aracaju/SE, atendimento trifásico 127/220 V e consumo médio mensal de ${fmt(APP.state.inputs.consumoMensal,0)} kWh.</p>
      <p><strong>Cenário recomendado:</strong> ${c.recomendado}, por apresentar menor investimento inicial conforme os dados fornecidos.</p>
      <p><strong>Arranjo fotovoltaico:</strong> potência calculada de ${fmt(c.p2,2)} kWp e ${c.nmods} módulos de ${fmt(APP.state.inputs.moduloWp,0)} Wp, com distribuição de referência de 16 módulos em cada água da cobertura.</p>
      <p><strong>Inversor:</strong> referência de 15 kW, trifásico e com no mínimo 2 rastreadores MPPT, coerente com as duas orientações de cobertura.</p>
      <p><strong>Condutores e proteções CA:</strong> corrente de projeto aproximada de ${fmt(c.ib,2)} A, condutor de 16 mm² e disjuntor de 50 A, conforme referência do gabarito.</p>
      <p><strong>Aterramento e DPS:</strong> prever aterramento/equipotencialização e DPS CA Classe II, 175 V, 45 kA.</p>
      <p><strong>Instalação e segurança:</strong> executar de acordo com documentação técnica, requisitos de segurança e procedimentos aplicáveis à instalação fotovoltaica.</p>`;
    markComplete('memorial');
  },
  parecer(){
    $('#parecerRows').innerHTML=[
      ['Número de fases e MPPTs','Inversor trifásico com mínimo de 2 MPPTs, adequado ao atendimento trifásico 127/220 V e à divisão do arranjo nas duas águas/orientações da cobertura.'],
      ['DPS CA','DPS Classe II, 175 V, 45 kA, conforme referência do gabarito para sistema conectado à rede aérea e sujeito a surtos indiretos/manobras.'],
      ['Classificação GD','Microgeração, conforme classificação indicada no gabarito da avaliação.']
    ].map(([t,a])=>`<div class="calc-card"><strong>${t}</strong><div class="transcription"><strong>Para transcrever:</strong><br>${a}</div></div>`).join('');
    markComplete('parecer');
  },
  diagrama1(){
    $('#diagram1Transcription').innerHTML='<strong>Para transcrever:</strong><br>Representar módulos FV divididos entre as duas águas → proteção CC → inversor trifásico 15 kW / 2 MPPTs → proteção CA (disjuntor 50 A e DPS Classe II) → rede/cargas, incluindo aterramento/equipotencialização.';
    markComplete('diagrama1');
  },
  sp2(){
    const ens=APP.data.prova1.sp2.ensaios;
    $('#commissionBody').innerHTML=ens.map((e,i)=>{
      const val=APP.state.commission[i]?.valor??'', conf=APP.state.commission[i]?.conf??'';
      return `<tr><td>${e}</td><td><input data-comm-val="${i}" value="${escapeHtml(val)}" placeholder="Valor ou N.A."></td><td><select data-comm-conf="${i}"><option></option><option ${conf==='Conforme'?'selected':''}>Conforme</option><option ${conf==='Não conforme'?'selected':''}>Não conforme</option></select></td></tr>`
    }).join('');
    $$('[data-comm-val]').forEach(el=>el.addEventListener('input',()=>saveComm(el.dataset.commVal,'valor',el.value)));
    $$('[data-comm-conf]').forEach(el=>el.addEventListener('change',()=>saveComm(el.dataset.commConf,'conf',el.value)));
    markComplete('sp2');
  },
  sp3(){
    const ds=APP.data.prova1.sp3.defeitos;
    $('#faultCards').innerHTML=ds.map((d,i)=>{
      const hide=APP.state.mode==='treinar';
      return `<div class="calc-card"><h4>Defeito ${i+1}</h4>
        <div class="${hide?'answer-hidden':''}" data-fault-answer="${i}">
          <p><strong>Defeito:</strong> ${d.defeito}</p>
          <p><strong>Reparo:</strong> ${d.reparo}</p>
          <p><strong>Possíveis causas:</strong> ${d.causas.join('; ')}.</p>
          <div class="transcription"><strong>Para transcrever:</strong><br>${d.defeito} | ${d.reparo} | ${d.causas[0]}.</div>
        </div>
        ${hide?`<button class="btn primary reveal" data-reveal-fault="${i}">Revelar solução</button>`:''}
      </div>`
    }).join('');
    $$('[data-reveal-fault]').forEach(b=>b.addEventListener('click',()=>{document.querySelector(`[data-fault-answer="${b.dataset.revealFault}"]`).classList.remove('answer-hidden');b.remove()}));
    markComplete('sp3');
  },
  apr(){
    const risks=['Choque elétrico','Retorno de tensão','Indução elétrica','Energização acidental','Arco elétrico','Queimaduras','Proximidade a circuitos energizados','Manobra indevida','Falta de bloqueio físico','Falta de sinalização'];
    $('#aprList').innerHTML=risks.map((r,i)=>`<div class="check-item"><input type="checkbox" data-apr-check="${i}" ${APP.state.apr[i]?.checked?'checked':''}><div><strong>${r}</strong><textarea data-apr-text="${i}" placeholder="Medida de controle">${escapeHtml(APP.state.apr[i]?.text||'')}</textarea></div></div>`).join('');
    $$('[data-apr-check]').forEach(el=>el.addEventListener('change',()=>saveApr(el.dataset.aprCheck,'checked',el.checked)));
    $$('[data-apr-text]').forEach(el=>el.addEventListener('input',()=>saveApr(el.dataset.aprText,'text',el.value)));
    markComplete('apr');
  },
  bancada(){
    const b=APP.data.bancada;
    $('#equipmentCards').innerHTML=`
      <div class="card"><h4>${b.modulo.marca} ${b.modulo.modelo}</h4><p>${b.modulo.Pmax_W} W | Vmp ${b.modulo.Vmp_V} V | Voc ${b.modulo.Voc_V} V | Imp ${b.modulo.Imp_A} A | Isc ${b.modulo.Isc_A} A</p></div>
      <div class="card"><h4>${b.bateria.marca} ${b.bateria.modelo}</h4><p>${b.bateria.tensao_V} V | ${b.bateria.capacidade_Ah} Ah | regime ${b.bateria.regime_h} h</p></div>`+
      b.inversores.map(i=>`<div class="card"><h4>${i.marca} ${i.modelo}</h4><p>${i.potencia_W} W | MPPT ${i.mpptMin_V??'—'}–${i.mpptMax_V??'—'} V | Voc máx. ${i.vocMax_V??'—'} V</p></div>`).join('');
    const sel=$('#benchInverter'); sel.innerHTML=b.inversores.map((i,idx)=>`<option value="${idx}">${i.marca} ${i.modelo}</option>`).join('');
    const update=()=>validateBench(Number(sel.value),Number($('#seriesCount').value));
    sel.addEventListener('change',update); $('#seriesCount').addEventListener('input',update); update();
    markComplete('bancada');
  },
  transcricao(){
    $('#transcriptionSheet').innerHTML=buildTranscription();
    $('#printTranscription').addEventListener('click',()=>window.print());
    markComplete('transcricao');
  },
  validacao(){
    const items=[
      'Potência FV do Cenário I calculada',
      'Volume do SAS e energia útil calculados',
      'Potência FV do Cenário II calculada',
      'Investimentos e comparação concluídos',
      'Quantidade de módulos, área e inversor definidos',
      'Condutor, disjuntor, parecer e diagrama preparados',
      'Relatório/PDF pronto para exportação',
      'Diagrama híbrido da Situação 02 preparado',
      'Quadro 06 de comissionamento preenchido',
      'Sistema nos modos rede/isolado verificado na bancada',
      'Três defeitos da Situação 03 diagnosticados e corrigidos',
      'Quadro 07 preenchido'
    ];
    $('#validationList').innerHTML=items.map((x,i)=>`<div class="check-item"><input type="checkbox" ${APP.state.completed[`v${i}`]?'checked':''} data-val="${i}"><div>${x}</div></div>`).join('');
    $$('[data-val]').forEach(el=>el.addEventListener('change',()=>{APP.state.completed[`v${el.dataset.val}`]=el.checked;saveState()}));
    markComplete('validacao');
  }
};

function calcCard(title,formula,answer,i){
  const hide=APP.state.mode==='treinar';
  const showFormula=APP.state.mode!=='resolver' || true;
  return `<details class="calc-card" ${APP.state.mode==='resolver'?'open':''}><summary>${title}</summary>
    ${showFormula?`<div class="formula">${formula}</div>`:''}
    <div class="transcription ${hide?'answer-hidden':''}" data-answer="${i}"><strong>Para transcrever:</strong><br>${answer}</div>
    ${hide?`<button class="btn primary reveal" data-reveal="${i}">Revelar resposta</button>`:''}
  </details>`;
}
function bindReveal(){
  $$('[data-reveal]').forEach(b=>b.addEventListener('click',()=>{document.querySelector(`[data-answer="${b.dataset.reveal}"]`).classList.remove('answer-hidden');b.remove()}));
}
function buildTranscription(){
  const c=calc(), d=APP.data.prova1.sp3.defeitos, ens=APP.data.prova1.sp2.ensaios;
  const comm=ens.map((e,i)=>`<tr><td>${e}</td><td>${escapeHtml(APP.state.commission[i]?.valor||'________')}</td><td>${escapeHtml(APP.state.commission[i]?.conf||'________')}</td></tr>`).join('');
  return `
    <h2>Folha de Transcrição — Prova 01</h2>
    <p><strong>Aluno:</strong> ${escapeHtml(APP.state.studentName||'________________')} &nbsp; <strong>Turma:</strong> ${escapeHtml(APP.state.studentClass||'________________')}</p>
    <hr><h3>QUADRO 01 — Avaliação e recomendação</h3>
    <p><strong>SAS:</strong> Varm = ${fmt(c.volumeArm,2)} L; Eutil = ${fmt(c.energiaUtil,2)} kWh/mês; investimento = ${money(c.invSAS)}.</p>
    <p><strong>Cenário I:</strong> PFV = ${fmt(c.p1,2)} kWp; investimento = ${money(c.inv1)}.</p>
    <p><strong>Cenário II:</strong> PFV = ${fmt(c.p2,2)} kWp; SFCR = ${money(c.inv2sfcr)}; total com SAS = ${money(c.inv2)}.</p>
    <p><strong>Recomendação:</strong> ${c.recomendado}, por apresentar menor investimento inicial.</p>
    <hr><h3>MEMORIAL DESCRITIVO / QUADRO 02</h3>
    <p>${c.nmods} módulos de ${fmt(APP.state.inputs.moduloWp,0)} Wp; potência instalada aproximada ${fmt(c.pInst,2)} kWp; distribuição de referência 16 módulos em cada água; área aproximada ${fmt(c.area,2)} m².</p>
    <p>Inversor de referência: 15 kW, trifásico, mínimo 2 MPPTs. Corrente CA ≈ ${fmt(c.ib,2)} A; condutor 16 mm²; disjuntor 50 A.</p>
    <hr><h3>QUADRO 03 — Parecer Técnico</h3>
    <p>Inversor trifásico com mínimo 2 MPPTs. DPS CA Classe II, 175 V, 45 kA. Sistema classificado como Microgeração.</p>
    <hr><h3>QUADRO 04 — Diagrama</h3>
    <p>Módulos FV → proteção CC → inversor 15 kW / 3φ / 2 MPPTs → disjuntor 50 A + DPS Classe II → rede/cargas + aterramento.</p>
    <hr><h3>QUADRO 05 — Sistema Híbrido</h3>
    <p>Módulos FV → String Box → inversor híbrido ↔ rede; conectar bateria ao barramento/entrada CC do inversor e saída dedicada para cargas prioritárias, com proteções correspondentes.</p>
    <hr><h3>QUADRO 06 — Comissionamento</h3>
    <table><thead><tr><th>Ensaio</th><th>Valor medido</th><th>Conformidade</th></tr></thead><tbody>${comm}</tbody></table>
    <hr><h3>QUADRO 07 — Registro de Manutenção</h3>
    <table><thead><tr><th>Defeito</th><th>Reparo realizado</th><th>Possível causa</th></tr></thead><tbody>
    ${d.map(x=>`<tr><td>${x.defeito}</td><td>${x.reparo}</td><td>${x.causas[0]}</td></tr>`).join('')}
    </tbody></table>`;
}
function validateBench(invIndex,count){
  const mod=APP.data.bancada.modulo, inv=APP.data.bancada.inversores[invIndex];
  const vmp=count*mod.Vmp_V, voc=count*mod.Voc_V, p=count*mod.Pmax_W;
  const mpptOK = inv.mpptMin_V!=null && inv.mpptMax_V!=null ? (vmp>=inv.mpptMin_V && vmp<=inv.mpptMax_V) : null;
  const vocOK = inv.vocMax_V!=null ? voc<inv.vocMax_V : null;
  $('#benchValidation').innerHTML=`
    <p><strong>${count} módulos em série</strong></p>
    <p>Vmp string = ${fmt(vmp,1)} V — <span class="${mpptOK?'ok':'bad'}">${mpptOK?'dentro':'fora'} da faixa MPPT ${inv.mpptMin_V}–${inv.mpptMax_V} V</span></p>
    <p>Voc string = ${fmt(voc,1)} V — <span class="${vocOK?'ok':'bad'}">${vocOK?'abaixo':'acima'} do limite ${inv.vocMax_V} V</span></p>
    <p>Potência = ${fmt(p,0)} W.</p>
    ${vocOK && voc/inv.vocMax_V>0.9?'<p class="warn">Atenção: Voc muito próximo do limite. Verifique correção por temperatura antes de aprovar a configuração.</p>':''}`;
}
function saveComm(i,k,v){APP.state.commission[i]=APP.state.commission[i]||{};APP.state.commission[i][k]=v;saveState()}
function saveApr(i,k,v){APP.state.apr[i]=APP.state.apr[i]||{};APP.state.apr[i][k]=v;saveState()}
function exportJSON(){
  const blob=new Blob([JSON.stringify({app:'SAEP Renováveis Inteligente',version:1,state:APP.state},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='saep-renovaveis-projeto.json';a.click();URL.revokeObjectURL(a.href);
}
function importJSON(e){
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();r.onload=()=>{try{const j=JSON.parse(r.result);APP.state={...APP.state,...(j.state||j)};saveState();location.reload()}catch(err){alert('JSON inválido')}};r.readAsText(f);
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
init();
