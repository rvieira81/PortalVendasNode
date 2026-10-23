import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Etapas, Paginacao, Preco, Quantidade } from './Basicos';

describe('componentes básicos', () => {
  it('etiqueta de preço mostra o preço "de" riscado', () => {
    render(<Preco valor={199.9} de={249.9} />);
    expect(screen.getByText(/199,90/)).toBeInTheDocument();
    expect(screen.getByLabelText(/De R\$/)).toHaveTextContent('249,90');
  });

  it('etapas marcam a atual para leitores de tela', () => {
    render(<Etapas atual={2} />);
    expect(screen.getByText('Entrega')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Carrinho')).toHaveClass('feita');
  });

  it('quantidade respeita o mínimo e o máximo', async () => {
    const aoMudar = vi.fn();
    render(<Quantidade valor={5} maximo={5} aoMudar={aoMudar} />);
    expect(screen.getByLabelText('Aumentar')).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Diminuir'));
    expect(aoMudar).toHaveBeenCalledWith(4);
  });

  it('paginação indica a página atual', async () => {
    const aoMudar = vi.fn();
    render(<Paginacao pagina={2} paginas={3} aoMudar={aoMudar} />);
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    expect(aoMudar).toHaveBeenCalledWith(3);
  });
});
