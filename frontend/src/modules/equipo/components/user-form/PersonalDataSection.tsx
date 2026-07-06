import { capitalizeWords } from '@src/core/parse';
import { Col, Form, FormInstance, Input, Row, Select } from 'antd';
import { UserData } from '../../services/users.service';

interface PersonalDataSectionProps {
    form: FormInstance;
    allUsers?: UserData[];
    userId?: number;
    isSystemProtected?: boolean;
}

export const PersonalDataSection = ({ form, allUsers = [], userId, isSystemProtected: _isSystemProtected }: PersonalDataSectionProps) => {
    return (
        <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
            <Row gutter={16}>
                <Col span={12}>
                    <Form.Item
                        name="first_name"
                        label="Nombre"
                        rules={[{ required: true, message: 'Requerido' }]}
                        style={{ marginBottom: '8px' }}
                    >
                        <Input
                            placeholder="Juan"
                            maxLength={50}
                            onBlur={() => {
                                const val = form.getFieldValue('first_name');
                                if (val) form.setFieldsValue({ first_name: capitalizeWords(val) });
                            }}
                        />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item
                        name="last_name"
                        label="Apellidos"
                        rules={[{ required: true, message: 'Requerido' }]}
                        style={{ marginBottom: '8px' }}
                    >
                        <Input
                            placeholder="Pérez"
                            maxLength={50}
                            onBlur={() => {
                                const val = form.getFieldValue('last_name');
                                if (val) form.setFieldsValue({ last_name: capitalizeWords(val) });
                            }}
                        />
                    </Form.Item>
                </Col>
            </Row>

            <Row gutter={16}>
                <Col span={12}>
                    <Form.Item
                        name="dni"
                        label="DNI"
                        rules={[
                            { required: true, message: 'Requerido' },
                            { pattern: /^\d{8}$/, message: 'Debe tener 8 dígitos' },
                            {
                                validator: async (_, value) => {
                                    if (!value) return Promise.resolve();
                                    const duplicate = allUsers.find(u =>
                                        u.dni === value &&
                                        u.status === true &&
                                        (!userId || u.id !== userId)
                                    );
                                    if (duplicate) {
                                        return Promise.reject(new Error('Este DNI ya está registrado'));
                                    }
                                    return Promise.resolve();
                                }
                            }
                        ]}
                        normalize={(value) => value.replace(/\D/g, '')}
                        style={{ marginBottom: '8px' }}
                    >
                        <Input placeholder="12345678" maxLength={8} />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item
                        name="phone"
                        label="Teléfono"
                        rules={[
                            { pattern: /^\d+$/, message: 'Solo números' },
                            {
                                validator: async (_, value) => {
                                    if (!value) return Promise.resolve();
                                    const duplicate = allUsers.find(u =>
                                        (u.phone === value || u.telefono === value) &&
                                        u.status === true &&
                                        (!userId || u.id !== userId)
                                    );
                                    if (duplicate) {
                                        return Promise.reject(new Error('Este teléfono ya está registrado'));
                                    }
                                    return Promise.resolve();
                                }
                            }
                        ]}
                        normalize={(value) => value.replace(/\D/g, '')}
                        style={{ marginBottom: '8px' }}
                    >
                        <Input placeholder="987654321" maxLength={9} />
                    </Form.Item>
                </Col>
            </Row>

            <Row gutter={16}>
                <Col span={24}>
                    <Form.Item
                        name="cargo"
                        label="Cargo"
                        style={{ marginBottom: '8px' }}
                    >
                        <Input placeholder="Ej. Analista de cobranzas" maxLength={150} />
                    </Form.Item>
                </Col>
            </Row>
            <Row gutter={16}>
                <Col span={12}>
                    <Form.Item
                        name="enable"
                        label="Estado de Usuario"
                        rules={[{ required: true }]}
                        style={{ marginBottom: '12px' }}
                    >
                        <Select
                            options={[
                                { label: 'Activo', value: true },
                                { label: 'Inactivo', value: false },
                            ]}
                        />
                    </Form.Item>
                </Col>
            </Row>

        </div>
    );
};
