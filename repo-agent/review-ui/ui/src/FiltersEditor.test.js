import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FiltersEditor from './FiltersEditor';

test('renders filters editor with initial values', () => {
  const spec = {
    review: {
      preferAssignedToSelf: true,
      excludePullRequests: [123, 456],
      labels: [['bug', 'p0'], ['security']]
    }
  };
  const onChange = jest.fn();

  render(<FiltersEditor spec={spec} onChange={onChange} />);

  expect(screen.getByLabelText(/Prefer Assigned To Self/i)).toBeChecked();
  expect(screen.getByDisplayValue('123, 456')).toBeInTheDocument();
  expect(screen.getByDisplayValue('bug, p0')).toBeInTheDocument();
  expect(screen.getByDisplayValue('security')).toBeInTheDocument();
});

test('calls onChange when inputs change', () => {
  const spec = { review: {} };
  const onChange = jest.fn();

  render(<FiltersEditor spec={spec} onChange={onChange} />);

  const checkbox = screen.getByLabelText(/Prefer Assigned To Self/i);
  fireEvent.click(checkbox);
  
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    review: expect.objectContaining({
      preferAssignedToSelf: true
    })
  }));
});

test('updates label groups correctly', () => {
  const spec = {
    review: {
      labels: [['initial']]
    }
  };
  const onChange = jest.fn();

  render(<FiltersEditor spec={spec} onChange={onChange} />);

  const labelInput = screen.getByDisplayValue('initial');
  fireEvent.change(labelInput, { target: { value: 'initial, modified' } });

  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    review: expect.objectContaining({
      labels: [['initial', 'modified']]
    })
  }));
});

test('adds new label group', () => {
  const spec = { review: { labels: [] } };
  const onChange = jest.fn();

  render(<FiltersEditor spec={spec} onChange={onChange} />);

  const addButton = screen.getByText(/\+ Add Label Group/i);
  fireEvent.click(addButton);

  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    review: expect.objectContaining({
      labels: [[]]
    })
  }));
});
