import { Check, ClipboardCheck, FileCheck2, ImagePlus, LayoutDashboard, ListChecks, MapPin, ReceiptText, RefreshCw, Send, ShieldCheck, Sparkles, Store, Truck, Wand2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { api, GenerateInput, clearAdminSession } from './api';
import { AdminOverview, Baker, CakeWork, CredentialFile, Demand, MerchantWorkbench, Order, Payment, Quote, ReviewQueue } from './types';

const initialInput: GenerateInput = {
  prompt: '送给女朋友的粉色蝴蝶结生日蛋糕',
  scenario: '生日',
  style: '韩系奶油风',
  color: '粉色',
  size: '6寸',
  budget: '200-399元',
};

const scenarioOptions = ['生日', '情侣', '闺蜜', '毕业', '宠物', '纪念日'];
const styleOptions = ['韩系奶油风', '复古花艺', '高级简约', '可爱卡通', '国潮', '黑金'];
const colorOptions = ['粉色', '白绿', '香槟金', '蓝色', '紫色', '红色'];
const sizeOptions = ['4寸', '6寸', '8寸'];
const budgetOptions = ['100-199元', '200-399元', '400-699元', '700元以上'];

type AdminSectionKey = 'overview' | 'audit' | 'merchant' | 'fulfillment' | 'afterSale' | 'finance' | 'logs';
type AdminPageKey =
  | 'overview'
  | 'workReview'
  | 'demandReview'
  | 'merchantQualification'
  | 'pendingQuotes'
  | 'fulfillmentOrders'
  | 'refundNegotiation'
  | 'supportTickets'
  | 'rewardReviews'
  | 'auditLogs';

interface AdminPageConfig {
  key: AdminPageKey;
  label: string;
  description: string;
}

interface AdminSectionConfig {
  key: AdminSectionKey;
  label: string;
  description: string;
  icon: ReactNode;
  pages: AdminPageConfig[];
}

const adminSections: AdminSectionConfig[] = [
  {
    key: 'overview',
    label: '总览',
    description: '关键数量和待处理入口',
    icon: <LayoutDashboard size={18} />,
    pages: [
      { key: 'overview', label: '运营总览', description: '查看所有待处理事项和最新状态' },
    ],
  },
  {
    key: 'audit',
    label: '内容审核',
    description: '公开作品与制作需求',
    icon: <ListChecks size={18} />,
    pages: [
      { key: 'workReview', label: '作品审核', description: '审核已提交公开的作品' },
      { key: 'demandReview', label: '需求审核', description: '审核用户发布的制作需求' },
    ],
  },
  {
    key: 'merchant',
    label: '商家管理',
    description: '资质、报价与接单',
    icon: <Store size={18} />,
    pages: [
      { key: 'merchantQualification', label: '商家资质审核', description: '核验健康证、营业执照和食品资质' },
      { key: 'pendingQuotes', label: '待报价需求', description: '为已审核需求提交商家报价' },
    ],
  },
  {
    key: 'fulfillment',
    label: '订单履约',
    description: '制作、配送、自提',
    icon: <Truck size={18} />,
    pages: [
      { key: 'fulfillmentOrders', label: '履约订单', description: '推进确认制作、制作中和完成订单' },
    ],
  },
  {
    key: 'afterSale',
    label: '售后退款',
    description: '投诉与退款协商',
    icon: <ReceiptText size={18} />,
    pages: [
      { key: 'refundNegotiation', label: '售后退款协商', description: '记录退款协商和平台介入进展' },
      { key: 'supportTickets', label: '售后投诉', description: '处理投诉和客服工单' },
    ],
  },
  {
    key: 'finance',
    label: '财务激励',
    description: '灵感券与奖励',
    icon: <FileCheck2 size={18} />,
    pages: [
      { key: 'rewardReviews', label: '灵感券审核', description: '审核任务奖励和灵感券记录' },
    ],
  },
  {
    key: 'logs',
    label: '日志',
    description: '审核与操作记录',
    icon: <ClipboardCheck size={18} />,
    pages: [
      { key: 'auditLogs', label: '审核日志', description: '查看最近后台操作记录' },
    ],
  },
];

const bakerCredentialDescriptors: Array<{
  kind: CredentialFile['kind'];
  label: string;
  field: keyof Pick<Baker, 'healthCertificateUrl' | 'businessLicenseUrl' | 'foodPermitUrl'>;
}> = [
  { kind: 'healthCertificate', label: '健康证', field: 'healthCertificateUrl' },
  { kind: 'businessLicense', label: '营业执照', field: 'businessLicenseUrl' },
  { kind: 'foodPermit', label: '食品资质', field: 'foodPermitUrl' },
];

function presentBakerCredentialFiles(baker: Baker): CredentialFile[] {
  if (baker.credentialFiles?.length) {
    return baker.credentialFiles;
  }
  return bakerCredentialDescriptors.map(({ kind, label, field }) => {
    const sourceUrl = baker[field] || '';
    return {
      kind,
      label,
      sourceUrl,
      available: /^https?:\/\//.test(sourceUrl),
      directUrl: /^https?:\/\//.test(sourceUrl) ? sourceUrl : '',
      originalName: sourceUrl ? sourceUrl.split('/').pop() || `${label}.jpg` : '',
    } as CredentialFile;
  });
}

export function App() {
  const [mode, setMode] = useState<'workspace' | 'admin'>('workspace');
  const [input, setInput] = useState<GenerateInput>(initialInput);
  const [work, setWork] = useState<CakeWork | null>(null);
  const [demand, setDemand] = useState<Demand | null>(null);
  const [bakers, setBakers] = useState<Baker[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [refineNote, setRefineNote] = useState('');
  const [loading, setLoading] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    void bootstrap();
  }, []);

  const selectedBaker = useMemo(() => bakers[0], [bakers]);
  const total = quote ? quote.amount + quote.deliveryFee : 0;

  async function bootstrap() {
    try {
      await api.devLogin();
      await api.devLogin('demo-baker-user');
      api.usePlayerSession();
    } catch (err) {
      setError(toMessage(err));
    }
    await refreshLists();
  }

  async function refreshLists() {
    try {
      const [nextBakers, nextDemands] = await Promise.all([api.listBakers(), api.listDemands()]);
      setBakers(nextBakers);
      setDemands(nextDemands);
    } catch (err) {
      setError(toMessage(err));
    }
  }

  async function runStep<T>(name: string, task: () => Promise<T>) {
    setLoading(name);
    setError('');
    try {
      return await task();
    } catch (err) {
      setError(toMessage(err));
      throw err;
    } finally {
      setLoading('');
    }
  }

  async function handleGenerate() {
    const result = await runStep('生成中', () => api.generateWork(input));
    setWork(result.work);
    setRefineNote('');
    setDemand(null);
    setQuote(null);
    setPayment(null);
    await refreshLists();
  }

  async function handleRefine() {
    if (!work) return;

    const note = refineNote.trim() || '保留主体构思，做一个更精致、更适合落地制作的版本';

    const result = await runStep('微调中', () => api.refineWork(work.id, note));
    setInput({
      prompt: result.work.prompt,
      scenario: result.work.scenario,
      style: result.work.style,
      color: result.work.color,
      size: result.work.size,
      budget: result.work.budget,
    });
    setWork(result.work);
    setRefineNote('');
    setDemand(null);
    setQuote(null);
    setPayment(null);
    await refreshLists();
  }

  async function handlePublish() {
    if (!work) return;
    const result = await runStep('发布中', () => api.publishDemand(work));
    const approved = await runStep('本地审核需求', () => api.reviewDemand(result.id, 'approved', '本地体验自动审核'));
    setDemand(approved);
    await refreshLists();
  }

  async function handleQuote() {
    if (!demand) return;
    try {
      api.useBakerSession();
      const result = await runStep('报价中', () => api.createQuote(demand.id, selectedBaker?.id || 'demo-baker'));
      setQuote(result);
    } finally {
      api.usePlayerSession();
    }
  }

  async function handlePay() {
    if (!quote) return;
    api.usePlayerSession();
    const selected = quote.status === 'selected' ? quote : await runStep('选择报价', () => api.selectQuote(quote.id));
    setQuote(selected);
    setPayment({
      id: `intent-${selected.id}`,
      quoteId: selected.id,
      userId: 'demo-user',
      amount: selected.amount + selected.deliveryFee,
      provider: 'intent',
      status: '意向已确认',
      payParams: {},
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">如意鲜果蛋糕 · 长治试运营</p>
          <h1>AI 蛋糕定制工作台</h1>
        </div>
        <div className="status-pill">
          <MapPin size={16} />
          山西长治
        </div>
      </section>

      <div className="mode-tabs">
        <button className={mode === 'workspace' ? 'active' : ''} onClick={() => setMode('workspace')}>
          <Wand2 size={16} />
          体验工作台
        </button>
        <button className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')}>
          <ShieldCheck size={16} />
          运营审核后台
        </button>
      </div>

      {mode === 'admin' ? <AdminDashboard /> : (
        <>

      <section className="workspace">
        <form className="panel generator" onSubmit={(event) => event.preventDefault()}>
          <div className="panel-head">
            <Wand2 size={20} />
            <h2>生成蛋糕</h2>
          </div>

          <label>
            蛋糕想法
            <textarea
              value={input.prompt}
              onChange={(event) => setInput({ ...input, prompt: event.target.value })}
              rows={4}
              data-testid="prompt-input"
            />
          </label>

          <div className="field-grid">
            <Select label="场景" value={input.scenario} options={scenarioOptions} onChange={(scenario) => setInput({ ...input, scenario })} />
            <Select label="风格" value={input.style} options={styleOptions} onChange={(style) => setInput({ ...input, style })} />
            <Select label="色系" value={input.color} options={colorOptions} onChange={(color) => setInput({ ...input, color })} />
            <Select label="尺寸" value={input.size} options={sizeOptions} onChange={(size) => setInput({ ...input, size })} />
            <Select label="预算" value={input.budget} options={budgetOptions} onChange={(budget) => setInput({ ...input, budget })} />
          </div>

          <button className="primary-button" onClick={handleGenerate} disabled={Boolean(loading)} data-testid="generate-button">
            <Sparkles size={18} />
            {loading === '生成中' ? '生成中...' : '生成并保存'}
          </button>
        </form>

        <section className="panel preview">
          <div className="panel-head">
            <ImagePlus size={20} />
            <h2>当前作品</h2>
          </div>
          {work ? (
            <>
              <img className="cake-image" src={work.imageUrl} alt={work.title} data-testid="cake-image" />
              <div className="work-copy">
                <h3>{work.title}</h3>
                <p>{work.prompt}</p>
                <div className="tags">
                  {[work.scenario, work.style, work.color, work.size, work.budget].map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              <div className="refine-box">
                <label>
                  继续微调
                  <textarea
                    value={refineNote}
                    onChange={(event) => setRefineNote(event.target.value)}
                    rows={3}
                    placeholder="例如：蝴蝶结再大一点，奶油少一点，增加可食用珍珠装饰"
                    data-testid="refine-input"
                  />
                </label>
                <button className="primary-button" onClick={handleRefine} disabled={Boolean(loading)} data-testid="refine-button">
                  <RefreshCw size={18} />
                  {loading === '微调中' ? '微调中...' : '继续微调设计'}
                </button>
              </div>
              <button className="secondary-button" onClick={handlePublish} disabled={Boolean(loading)} data-testid="publish-button">
                <Send size={18} />
                {demand ? '已发布需求' : '发布制作需求'}
              </button>
            </>
          ) : (
            <div className="empty-state">
              <Sparkles size={34} />
              <p>输入想法后生成第一款蛋糕。</p>
            </div>
          )}
        </section>
      </section>

      <section className="flow-grid">
        <StatusPanel
          title="制作需求"
          icon={<Send size={18} />}
          active={Boolean(demand)}
          detail={demand ? `${demand.city}${demand.district} · ${demand.expectedDate} · ${demand.budget}` : '等待发布'}
          buttonLabel={demand ? '已进入报价' : '先发布作品'}
          disabled
        />

        <section className="panel">
          <div className="panel-head">
            <Store size={18} />
            <h2>长治蛋糕师</h2>
          </div>
          {selectedBaker ? (
            <div className="baker-card">
              <div>
                <h3>{selectedBaker.name}</h3>
                <p>{selectedBaker.district} · {selectedBaker.deliveryRadiusKm}km · 起订 ¥{selectedBaker.startingPrice}</p>
                <div className="tags">
                  {selectedBaker.specialties.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <p className="credential">平台审核：{selectedBaker.reviewStatus === 'approved' ? '已通过' : '审核中'}</p>
              </div>
              <button className="secondary-button" onClick={handleQuote} disabled={!demand || Boolean(loading)} data-testid="quote-button">
                <Send size={18} />
                {quote ? '已报价' : '提交报价'}
              </button>
            </div>
          ) : (
            <p className="muted">暂无蛋糕师。</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <Check size={18} />
            <h2>报价确认</h2>
          </div>
          {quote ? (
            <div className="quote-box">
              <div>
                <p className="price">¥{total}</p>
                <p className="muted">蛋糕 ¥{quote.amount} · 配送 ¥{quote.deliveryFee} · {quote.productionDays} 天制作</p>
                <p>{quote.message}</p>
              </div>
              <button className="primary-button" onClick={handlePay} disabled={Boolean(loading)} data-testid="pay-button">
                <Check size={18} />
                {payment ? '已确认报价意向' : '确认报价意向'}
              </button>
            </div>
          ) : (
            <p className="muted">等待蛋糕师报价。</p>
          )}
        </section>

        <StatusPanel
          title="确认状态"
          icon={<Check size={18} />}
          active={Boolean(payment)}
          detail={payment ? `${payment.status} · ¥${payment.amount}` : '等待确认报价'}
          buttonLabel="完成"
          disabled
        />
      </section>

      <section className="panel demand-list">
        <div className="panel-head">
          <Send size={18} />
          <h2>长治需求池</h2>
        </div>
        <div className="demand-table">
          {demands.length ? (
            demands.map((item) => (
              <article key={item.id}>
                <img src={item.work?.imageUrl || ''} alt={item.title} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.district} · {item.expectedDate} · {item.quoteCount || 0} 个报价</p>
                </div>
                <span>{item.status}</span>
              </article>
            ))
          ) : (
            <p className="muted">暂无发布需求。</p>
          )}
        </div>
      </section>

      {error && <div className="toast error">{error}</div>}
      {loading && <div className="toast">{loading}</div>}
        </>
      )}
    </main>
  );
}

function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [merchantWorkbench, setMerchantWorkbench] = useState<MerchantWorkbench | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentSection, setCurrentSection] = useState<AdminSectionKey>('overview');
  const [currentPage, setCurrentPage] = useState<AdminPageKey>('overview');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loggedInAdmin, setLoggedInAdmin] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (loggedInAdmin) {
      void loadAdminData();
    }
  }, [loggedInAdmin]);

  async function loadAdminData() {
    setLoading('刷新审核后台');
    setError('');
    try {
      const [nextOverview, nextQueue, nextOrders] = await Promise.all([
        api.adminOverview(),
        api.reviewQueue(),
        refreshOrders(),
      ]);
      setOverview(nextOverview);
      setQueue(nextQueue);
      setOrders(nextOrders);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading('');
    }
  }

  async function refreshOrders() {
    const workbench = await api.merchantWorkbench('demo-baker');
    setMerchantWorkbench(workbench);
    return workbench.fulfillmentOrders;
  }

  async function refreshAdmin() {
    if (!loggedInAdmin) {
      return;
    }
    await loadAdminData();
  }

  async function runAdmin(task: () => Promise<unknown>) {
    setLoading('处理中');
    setError('');
    try {
      await task();
      await refreshAdmin();
    } catch (err) {
      setError(toMessage(err));
      setLoading('');
    }
  }

  async function previewCredential(file: CredentialFile) {
    if (file.uploadId) {
      setLoading('打开资质');
      setError('');
      try {
        await api.openAdminUpload(file.uploadId);
      } catch (err) {
        setError(toMessage(err));
      } finally {
        setLoading('');
      }
      return;
    }

    if (file.directUrl && typeof window !== 'undefined') {
      window.open(file.directUrl, '_blank', 'noopener,noreferrer');
    }
  }

  const counts = overview?.counts || {};
  const pending = overview?.pending || {};
  const selectedSection = adminSections.find((section) => section.key === currentSection) || adminSections[0];
  const selectedPage = selectedSection.pages.find((page) => page.key === currentPage) || selectedSection.pages[0];
  const metricCards: Array<[string, number, number]> = [
    ['作品', counts.works || 0, pending.works || 0],
    ['需求', counts.demands || 0, pending.demands || 0],
    ['商家', counts.bakers || 0, pending.bakers || 0],
    ['待报价', pending.pendingQuoteDemands || 0, merchantWorkbench?.pendingQuoteDemands.length || 0],
    ['履约中', pending.fulfillmentOrders || 0, merchantWorkbench?.fulfillmentOrders.length || 0],
    ['退款协商', pending.refundNegotiations || 0, merchantWorkbench?.refundNegotiations.length || 0],
    ['售后', counts.supportTickets || 0, pending.supportTickets || 0],
    ['灵感券', counts.rewardReviews || 0, pending.rewards || 0],
  ];

  function chooseSection(section: AdminSectionConfig) {
    setCurrentSection(section.key);
    setCurrentPage(section.pages[0].key);
  }

  function renderAdminPage() {
    switch (selectedPage.key) {
      case 'overview':
        return (
          <section className="admin-page">
            <div className="admin-page-head">
              <div>
                <h2>运营总览</h2>
                <p className="muted">集中查看待处理数量，再进入左侧业务分层处理。</p>
              </div>
              <button className="secondary-button admin-refresh" onClick={refreshAdmin} disabled={Boolean(loading) || !loggedInAdmin}>
                <RefreshCw size={16} />
                刷新
              </button>
            </div>
            <section className="admin-metrics">
              {metricCards.map(([label, total, todo]) => (
                <article className="panel metric" key={label}>
                  <strong>{total}</strong>
                  <span>{label}</span>
                  <em>待处理 {todo}</em>
                </article>
              ))}
            </section>
          </section>
        );
      case 'workReview':
        return (
          <ReviewPanel
            title="作品审核"
            empty="暂无待公开审核作品"
            items={queue?.works || []}
            render={(item) => (
              <>
                {item.imageUrl ? <img className="review-work-image" src={item.imageUrl} alt={item.title} /> : null}
                <h3>{item.title}</h3>
                <p>{item.scenario} · {item.style} · {item.reviewStatus}</p>
                <p>{item.prompt}</p>
              </>
            )}
            approve={(id) => runAdmin(() => api.reviewWork(id, 'approved', '作品通过'))}
            reject={(id) => runAdmin(() => api.reviewWork(id, 'rejected', '作品不符合公开规则'))}
          />
        );
      case 'demandReview':
        return (
          <ReviewPanel
            title="需求审核"
            empty="暂无待审核需求"
            items={queue?.demands || []}
            render={(item) => (
              <>
                <h3>{item.title}</h3>
                <p>{item.city}{item.district} · {item.expectedDate} · {item.reviewStatus}</p>
                <p>{item.description}</p>
              </>
            )}
            approve={(id) => runAdmin(() => api.reviewDemand(id, 'approved', '需求通过'))}
            reject={(id) => runAdmin(() => api.reviewDemand(id, 'rejected', '需求信息不完整'))}
          />
        );
      case 'merchantQualification':
        return (
          <ReviewPanel
            title="商家资质审核"
            empty="暂无待审核商家"
            items={queue?.bakers || []}
            render={(item) => (
              <>
                <h3>{item.name}</h3>
                <p>{item.city}{item.district} · {item.deliveryRadiusKm}km · {item.reviewStatus}</p>
                <div className="credential-file-list">
                  {presentBakerCredentialFiles(item).map((file) => (
                    <div key={file.kind} className="credential-file-row">
                      <span className="credential-file-label">{file.label}：{file.originalName || (file.sourceUrl ? '已登记材料' : '待补充')}</span>
                      {file.uploadId ? (
                        <button className="ghost-button credential-open-button" onClick={() => previewCredential(file)}>
                          查看材料
                        </button>
                      ) : file.directUrl ? (
                        <a className="credential-open-link" href={file.directUrl} target="_blank" rel="noreferrer">
                          打开链接
                        </a>
                      ) : (
                        <span className="credential-source">{file.sourceUrl || '待补充'}</span>
                      )}
                    </div>
                  ))}
                </div>
                <p>联系方式：{item.contact}</p>
              </>
            )}
            approve={(id) => runAdmin(() => api.reviewBaker(id, 'approved', '资质通过'))}
            reject={(id) => runAdmin(() => api.reviewBaker(id, 'rejected', '资质需补充'))}
            approveLabel="资质通过"
            rejectLabel="资质需补充"
          />
        );
      case 'pendingQuotes':
        return (
          <section className="panel review-panel">
            <div className="panel-head">
              <Store size={18} />
              <h2>待报价需求</h2>
            </div>
            <div className="merchant-admin-list">
              {(merchantWorkbench?.pendingQuoteDemands || []).length ? (
                merchantWorkbench?.pendingQuoteDemands.map((item) => (
                  <article key={item.id} className="review-item">
                    <div>
                      <h3>{item.title}</h3>
                      <p>{item.city}{item.district} · {item.expectedDate} · 已有 {item.quoteCount || 0} 个报价</p>
                      <p>{item.description}</p>
                      <p>制作沟通：{item.productionLevel || 'discuss'} · {item.budget}</p>
                    </div>
                    <div className="review-actions">
                      <button className="primary-button" onClick={() => runAdmin(() => api.createMerchantQuote(item.id, 'demo-baker'))}>
                        提交报价
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="muted">暂无待报价需求。</p>
              )}
            </div>
          </section>
        );
      case 'fulfillmentOrders':
        return (
          <section className="panel review-panel">
            <div className="panel-head">
              <Truck size={18} />
              <h2>订单履约</h2>
            </div>
            <div className="order-admin-list">
              {orders.length ? (
                orders.map((order) => (
                  <article key={order.id} className="review-item">
                    <div>
                      <h3>{order.work?.title || order.demand?.title || 'AI 蛋糕订单'}</h3>
                      <p>{order.city}{order.district} · {order.expectedDate} · {order.totalText || `¥${order.amount}`}</p>
                      <p>订单：{order.statusText || order.status} · 履约：{order.fulfillment?.status || 'created'}</p>
                      <p>{order.fulfillment?.note || '等待蛋糕师确认制作排期。'}</p>
                    </div>
                    <div className="fulfillment-actions">
                      <button className="primary-button" onClick={() => runAdmin(() => api.updateFulfillment(order.id, 'baker_confirmed', '蛋糕师已确认制作排期'))}>
                        确认制作
                      </button>
                      <button className="secondary-button" onClick={() => runAdmin(() => api.updateFulfillment(order.id, 'producing', '蛋糕正在制作中'))}>
                        制作中
                      </button>
                      <button className="primary-button" onClick={() => runAdmin(() => api.updateFulfillment(order.id, 'completed', '订单已完成'))}>
                        完成订单
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="muted">暂无订单履约记录。</p>
              )}
            </div>
          </section>
        );
      case 'refundNegotiation':
        return (
          <section className="panel review-panel">
            <div className="panel-head">
              <ReceiptText size={18} />
              <h2>售后退款协商</h2>
            </div>
            <div className="merchant-admin-list">
              {(merchantWorkbench?.refundNegotiations || []).length ? (
                merchantWorkbench?.refundNegotiations.map((refund) => (
                  <article key={refund.id} className="review-item">
                    <div>
                      <h3>{refund.reason}</h3>
                      <p>{refund.statusText || refund.status} · 申请 ¥{refund.requestedAmount} · {refund.contact}</p>
                      <p>{refund.description}</p>
                      <p>{refund.platformNote || refund.supportTicket?.handlerNote || refund.evidenceNote}</p>
                    </div>
                    <div className="review-actions">
                      <button className="primary-button" onClick={() => runAdmin(() => api.updateRefundMediation(refund.id, '平台已记录本轮协商，继续核对成品、配送和沟通凭证。'))}>
                        记录协商
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="muted">暂无售后退款协商。</p>
              )}
            </div>
          </section>
        );
      case 'supportTickets':
        return (
          <ReviewPanel
            title="售后投诉"
            empty="暂无待处理售后"
            items={queue?.supportTickets || []}
            render={(item) => (
              <>
                <h3>{item.type}</h3>
                <p>{item.status} · {item.contact}</p>
                <p>{item.description}</p>
                <p>{item.evidenceNote}</p>
              </>
            )}
            approve={(id) => runAdmin(() => api.updateSupport(id, 'resolved', '已完成处理'))}
            reject={(id) => runAdmin(() => api.updateSupport(id, 'rejected', '暂不受理'))}
            approveLabel="已处理"
            rejectLabel="驳回"
          />
        );
      case 'rewardReviews':
        return (
          <ReviewPanel
            title="灵感券审核"
            empty="暂无待审核灵感券记录"
            items={queue?.rewardReviews || []}
            render={(item) => (
              <>
                <h3>{item.amount} 点</h3>
                <p>{item.status} · {item.userId}</p>
                <p>{item.reason}</p>
              </>
            )}
            approve={(id) => runAdmin(() => api.updateReward(id, 'approved', '灵感券审核通过'))}
            reject={(id) => runAdmin(() => api.updateReward(id, 'rejected', '灵感券不符合规则'))}
          />
        );
      case 'auditLogs':
        return (
          <section className="panel audit-log-panel">
            <div className="panel-head">
              <ClipboardCheck size={18} />
              <h2>审核日志</h2>
            </div>
            <div className="audit-list">
              {(overview?.latestAuditLogs || []).length ? (
                overview?.latestAuditLogs.map((log) => (
                  <article key={log.id}>
                    <strong>{log.targetType}</strong>
                    <span>{log.action}</span>
                    <p>{log.note || '无备注'} · {log.operator}</p>
                  </article>
                ))
              ) : (
                <p className="muted">暂无审核日志。</p>
              )}
            </div>
          </section>
        );
      default:
        return null;
    }
  }

  return (
    <section className="admin-shell">
      <section className="admin-hero panel">
        <div className="panel-head">
          <ShieldCheck size={20} />
          <h2>运营审核后台</h2>
        </div>
        <p className="muted">用于试运营阶段审核作品、制作需求、蛋糕师资质、售后投诉和灵感券记录。先登录管理员账号，再进入后台。</p>
        <div className="admin-auth-row">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="管理员用户名"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="管理员密码"
          />
          <button className="primary-button admin-refresh" onClick={async () => {
            try {
              setLoading('登录中');
              setError('');
              const session = await api.adminLogin(username.trim() || 'admin', password);
              setLoggedInAdmin(session.admin.username);
              await loadAdminData();
            } catch (err) {
              clearAdminSession();
              setLoggedInAdmin('');
              setError(toMessage(err));
            } finally {
              setLoading('');
            }
          }} disabled={Boolean(loading)}>
            <ShieldCheck size={16} />
            {loggedInAdmin ? '重新登录' : '管理员登录'}
          </button>
          <button className="secondary-button admin-refresh" onClick={refreshAdmin} disabled={Boolean(loading) || !loggedInAdmin}>
            <RefreshCw size={16} />
            刷新数据
          </button>
        </div>
        <p className="muted">当前登录：{loggedInAdmin || '未登录'}</p>
      </section>

      {loggedInAdmin && (
        <section className="admin-layout">
          <aside className="admin-sidebar">
            {adminSections.map((section) => (
              <button
                key={section.key}
                className={currentSection === section.key ? 'active' : ''}
                onClick={() => chooseSection(section)}
              >
                {section.icon}
                <span>{section.label}</span>
                <small>{section.description}</small>
              </button>
            ))}
          </aside>

          <section className="admin-content">
            <div className="admin-subnav">
              <div>
                <h2>{selectedSection.label}</h2>
                <p>{selectedSection.description}</p>
              </div>
              <div className="admin-subnav-tabs">
                {selectedSection.pages.map((page) => (
                  <button
                    key={page.key}
                    className={selectedPage.key === page.key ? 'active' : ''}
                    onClick={() => setCurrentPage(page.key)}
                  >
                    <span>{page.label}</span>
                    <small>{page.description}</small>
                  </button>
                ))}
              </div>
            </div>
            {renderAdminPage()}
          </section>
        </section>
      )}

      {error && <div className="toast error">{error}</div>}
      {loading && <div className="toast">{loading}</div>}
    </section>
  );
}

function ReviewPanel<T extends { id: string; reviewStatus?: string; status?: string }>({
  title,
  empty,
  items,
  render,
  approve,
  reject,
  approveLabel = '通过',
  rejectLabel = '拒绝',
}: {
  title: string;
  empty: string;
  items: T[];
  render: (item: T) => ReactNode;
  approve: (id: string) => void;
  reject: (id: string) => void;
  approveLabel?: string;
  rejectLabel?: string;
}) {
  return (
    <section className="panel review-panel">
      <div className="panel-head">
        <ClipboardCheck size={18} />
        <h2>{title}</h2>
      </div>
      <div className="review-list">
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className="review-item">
              <div>{render(item)}</div>
              <div className="review-actions">
                <button className="secondary-button" onClick={() => reject(item.id)}>{rejectLabel}</button>
                <button className="primary-button" onClick={() => approve(item.id)}>{approveLabel}</button>
              </div>
            </article>
          ))
        ) : (
          <p className="muted">{empty}</p>
        )}
      </div>
    </section>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusPanel({
  title,
  icon,
  active,
  detail,
}: {
  title: string;
  icon: ReactNode;
  active: boolean;
  detail: string;
  buttonLabel: string;
  disabled?: boolean;
}) {
  return (
    <section className={`panel status-card ${active ? 'active' : ''}`}>
      <div className="panel-head">
        {icon}
        <h2>{title}</h2>
      </div>
      <p>{detail}</p>
    </section>
  );
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : '请求失败';
}
