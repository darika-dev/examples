import type { Meta, StoryObj } from '@storybook/react';
import { ButtonConnect } from "./ButtonConnect"

const meta = {
  title: 'Components/Wallet Connect',
  component: ButtonConnect,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'nav',
    },
  },
  args: {},
} satisfies Meta<typeof ButtonConnect>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Connect: Story = {};
