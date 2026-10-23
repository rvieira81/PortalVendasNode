import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnderecoForm } from './EnderecoForm';

function respostaJson(corpo: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('EnderecoForm (RF07)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preenche rua, bairro, cidade e UF pelo CEP', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => respostaJson({ logradouro: 'Rua das Flores', bairro: 'Centro', cidade: 'Valinhos', uf: 'SP' }));
    render(<EnderecoForm aoSalvar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('CEP'), '13270000');
    await userEvent.tab();
    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue('Rua das Flores'));
    expect(screen.getByLabelText('Cidade')).toHaveValue('Valinhos');
    expect(screen.getByLabelText('UF')).toHaveValue('SP');
    expect(screen.getByLabelText('CEP')).toHaveValue('13270-000');
  });

  it('avisa quando o CEP não existe e deixa preencher à mão', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => respostaJson({ mensagem: 'CEP não encontrado. Preencha o endereço manualmente.' }, 404));
    render(<EnderecoForm aoSalvar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('CEP'), '00000000');
    await userEvent.tab();
    expect(await screen.findByText(/CEP não encontrado/)).toBeInTheDocument();
    expect(screen.getByLabelText('Rua')).toBeEnabled();
  });

  it('envia CEP só com números', async () => {
    const aoSalvar = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => respostaJson({ logradouro: 'Rua A', bairro: 'B', cidade: 'C', uf: 'SP' }));
    render(<EnderecoForm inicial={{ destinatario: 'Maria' }} aoSalvar={aoSalvar} />);
    await userEvent.type(screen.getByLabelText('CEP'), '13270000');
    await userEvent.tab();
    await userEvent.type(screen.getByLabelText('Número'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar endereço' }));
    await waitFor(() => expect(aoSalvar).toHaveBeenCalled());
    expect(aoSalvar.mock.calls[0][0]).toMatchObject({ cep: '13270000', numero: '10', destinatario: 'Maria', complemento: null });
  });
});
